// Vercel serverless function: generates the social posting batch and cleans
// up finished weeks. The browser never talks to the AI providers directly —
// the API key lives in the social_config row and only transits this function.
//
// Two callers:
//   * Vercel Cron (daily, see vercel.json): GET with the CRON_SECRET bearer.
//     Runs only when `now - last_generated_at >= cadence_days`.
//   * The «Generar ahora» button: POST with the admin's Supabase JWT. Runs
//     unless another run is still in flight. The JWT is verified and the
//     profile role must be 'admin'.
//
// Either caller claims the turn on social_config (last_generated_at) before
// generating anything, so only one batch is ever in flight and a killed run
// has spent its turn instead of re-generating the same days every night.
//
// What a run does:
//   1. Deletes confirmed posts whose week already ended (and their images in
//      the social-posts bucket). The calendar is a working surface, not an
//      archive; social_promoted keeps the rotation memory.
//   2. Picks the next items to promote: in stock, no pending post already,
//      least-recently-promoted first (never-promoted wins), more stock first.
//   3. For each item asks the configured provider for the caption + the
//      design texts the client-side composer renders. Providers with image
//      models also enhance the first product photo. Everything degrades to
//      templates/original photos on failure — a batch never half-dies.
//   4. Inserts social_posts rows, one per day at the configured time
//      (America/Caracas, fixed UTC-4), starting tomorrow.
//
// Env needed in Vercel: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, and
// VITE_SUPABASE_URL (already present for the build).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

// tsconfig has no Node types (lib is ES2022+DOM); declare the one Node global
// this file needs. fetch/FormData/Blob/atob/btoa come from the DOM lib and
// exist at runtime on Vercel's Node 20.
declare const process: { env: Record<string, string | undefined> };

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): { json(body: unknown): void };
}

const BUCKET = "social-posts";
const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC-4, no DST
// Wall-clock budget for one invocation, under maxDuration so the network calls
// are cut off while there is still time to write the posts they produced.
const RUN_BUDGET_MS = 45000;
// Slack on the cadence: a run started at 11:00:05 and the next cron fires at
// 11:00:0x, so an exact comparison lands just short and pushes the batch a day
// later every cycle. Consecutive fires are 24 h apart — an hour cannot double.
const DUE_SLACK_MS = 60 * 60 * 1000;
// A claim younger than this may still be generating (maxDuration is 60 s), so
// it keeps the turn: no second run picks the same items.
const LEASE_MS = 90000;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** fetch bounded by what is left of the run's budget. An AI call that would
 *  outlive the function is aborted and the item degrades to templates, instead
 *  of the runtime killing the run with part of the batch already inserted. */
let runDeadline = Date.now() + RUN_BUDGET_MS;
const budgetFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: AbortSignal.timeout(Math.max(1000, runDeadline - Date.now())),
  });

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Date parts of "now" as seen from Caracas. */
function caracasToday(): { y: number; m: number; d: number } {
  const shifted = new Date(Date.now() - CARACAS_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
  };
}

/** `daysFromToday` days ahead at `HH:MM` Caracas time, as a real instant. */
function caracasSlot(daysFromToday: number, time: string): Date {
  const { y, m, d } = caracasToday();
  const base = Date.UTC(y, m - 1, d + daysFromToday);
  const [hh, mm] = time.split(":").map((n) => parseInt(n, 10) || 0);
  return new Date(base + (hh * 60 + mm) * 60 * 1000 + CARACAS_OFFSET_MS);
}

/** Monday 00:00 of the current Caracas week, as a real instant. */
function caracasWeekStart(): Date {
  const { y, m, d } = caracasToday();
  const todayUtc = new Date(Date.UTC(y, m - 1, d));
  const dow = (todayUtc.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(todayUtc.getTime() - dow * 86400000 + CARACAS_OFFSET_MS);
}

// ---------------------------------------------------------------------------
// domain types
// ---------------------------------------------------------------------------

interface ItemRow {
  id: string;
  name: string;
  brand: string;
  type: string;
  notes: string | null;
  quantity: number;
  images: string[];
}

interface ConfigRow {
  business_name: string;
  logo_url: string;
  style_prompt: string;
  provider: string;
  api_key: string;
  cadence_days: number;
  posts_per_batch: number;
  post_time: string;
  platforms: string[];
  last_generated_at: string | null;
}

interface Callout {
  label: string;
  /** Feature position as fractions (0–1) of the first photo, localized by
   *  the multimodal provider; null when nothing visible matches the label. */
  x: number | null;
  y: number | null;
}

interface Design {
  t1: string;
  t2: string;
  t3: string;
  callouts: Callout[];
  statement: string;
}

interface GeneratedTexts {
  design: Design;
  caption: string;
}

interface Photo {
  bytes: Uint8Array;
  mime: string;
}

// ---------------------------------------------------------------------------
// fallback templates (provider 'none' or any AI failure)
// ---------------------------------------------------------------------------

/** First case-insensitive occurrence of `part` cut out of `name`. Plain
 *  string matching on purpose: inventory text is not a pattern, and a brand
 *  like "C++" would make `new RegExp` throw. */
function stripPart(name: string, part: string): string {
  const at = name.toLowerCase().indexOf(part.toLowerCase());
  return at < 0 ? name : name.slice(0, at) + name.slice(at + part.length);
}

function fallbackTexts(item: ItemRow, businessName: string): GeneratedTexts {
  const rest = stripPart(stripPart(item.name, item.brand), item.type).trim();
  return {
    design: {
      t1: item.type === "N/A" ? "DISPONIBLE" : item.type,
      t2: item.brand,
      t3: rest || item.name,
      callouts: [
        { label: "STOCK\nDISPONIBLE", x: null, y: null },
        { label: "CALIDAD\nGARANTIZADA", x: null, y: null },
        { label: "ATENCIÓN\nPOR DM", x: null, y: null },
      ],
      statement: "PREGUNTA POR EL TUYO.",
    },
    caption: [
      `${item.name} disponible en ${businessName}. 🏍️`,
      "",
      item.notes ? item.notes.trim() : "Calidad y atención de confianza.",
      "",
      item.quantity === 1
        ? "🚨 Última unidad disponible."
        : "Unidades limitadas.",
      "",
      "👉 Escríbenos por DM y aparta el tuyo.",
      "",
      "#MotosVenezuela #Motero #AccesoriosMoto",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// AI providers — texts
// ---------------------------------------------------------------------------

function textPrompt(item: ItemRow, config: ConfigRow): string {
  return [
    `Eres el community manager de "${config.business_name}", una tienda venezolana.`,
    "Genera el contenido de UN post de Instagram/Facebook para este producto.",
    "",
    `Producto: ${item.name}`,
    `Marca: ${item.brand} · Tipo: ${item.type} · Unidades: ${item.quantity}`,
    item.notes ? `Notas del inventario: ${item.notes}` : "",
    "",
    config.style_prompt ? `Dirección creativa: ${config.style_prompt}` : "",
    "",
    "Reglas fijas:",
    "- Español de Venezuela. NUNCA menciones precios.",
    "- Solo afirmaciones defendibles con las notas del inventario o visibles",
    "  en la foto; nada inventado. Menciona limitaciones reales con franqueza.",
    "- Caption: gancho en las primeras 10-12 palabras, emojis con moderación,",
    '  viñetas de beneficios con "▪️", escasez solo si es real (1 unidad),',
    '  UN llamado a la acción específico (ej: Comenta "CASCO", Comenta tu',
    "  TALLA), 3-5 hashtags específicos (#MotosVenezuela #Motero + del",
    "  producto). 150-220 palabras.",
    "- statement: eslogan de una línea terminado en punto, NO el nombre del producto.",
    "- callouts: 3 o 4 etiquetas cortas EN MAYÚSCULAS de características reales,",
    '  con salto de línea "\\n" si son dos palabras largas. Para cada una,',
    "  mira la foto adjunta y da la posición EXACTA del rasgo que menciona",
    '  ("DOBLE VISOR" → el visor, "CON CAPUCHA" → la capucha) como fracciones',
    "  x,y entre 0 y 1 del ancho/alto de la foto. Si la etiqueta no señala",
    "  nada visible, usa null.",
    "",
    "Responde SOLO un JSON con esta forma exacta:",
    '{"t1":"línea de categoría","t2":"marca o modelo (corto, protagonista)",',
    '"t3":"subtítulo de variante",',
    '"callouts":[{"label":"...","x":0.42,"y":0.31}],',
    '"statement":"...","caption":"..."}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function num01(value: unknown): number | null {
  return typeof value === "number" && value >= 0 && value <= 1 ? value : null;
}

function parseCallouts(value: unknown): Callout[] {
  if (!Array.isArray(value)) return [];
  const out: Callout[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      out.push({ label: entry, x: null, y: null });
    } else if (entry && typeof entry === "object") {
      const c = entry as Record<string, unknown>;
      const label = str(c.label);
      if (label) out.push({ label, x: num01(c.x), y: num01(c.y) });
    }
  }
  return out.slice(0, 4);
}

function parseTexts(raw: string, fallback: GeneratedTexts): GeneratedTexts {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return fallback;
    const doc = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const callouts = parseCallouts(doc.callouts);
    return {
      design: {
        t1: str(doc.t1, fallback.design.t1),
        t2: str(doc.t2, fallback.design.t2),
        t3: str(doc.t3, fallback.design.t3),
        callouts: callouts.length >= 3 ? callouts : fallback.design.callouts,
        statement: str(doc.statement, fallback.design.statement),
      },
      caption: str(doc.caption, fallback.caption),
    };
  } catch {
    return fallback;
  }
}

// The photo rides along on every text call so the model can localize each
// callout's feature (the "intentional connector lines" of the approved
// style). It must be the SAME image the post will display — targets are
// fractions of it — so callers pass the enhanced photo when there is one.

async function geminiTexts(
  prompt: string,
  apiKey: string,
  photo: Photo | null,
): Promise<string> {
  const parts: unknown[] = [{ text: prompt }];
  if (photo) {
    parts.push({
      inline_data: { mime_type: photo.mime, data: bytesToB64(photo.bytes) },
    });
  }
  const res = await budgetFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function openaiTexts(
  prompt: string,
  apiKey: string,
  photo: Photo | null,
): Promise<string> {
  const content: unknown[] = [{ type: "text", text: prompt }];
  if (photo) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${photo.mime};base64,${bytesToB64(photo.bytes)}`,
      },
    });
  }
  const res = await budgetFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function anthropicTexts(
  prompt: string,
  apiKey: string,
  photo: Photo | null,
): Promise<string> {
  const content: unknown[] = [];
  if (photo) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: photo.mime,
        data: bytesToB64(photo.bytes),
      },
    });
  }
  content.push({ type: "text", text: prompt });
  const res = await budgetFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
  };
  return data.content?.find((c) => c.type === "text")?.text ?? "";
}

async function generateTexts(
  item: ItemRow,
  config: ConfigRow,
  photo: Photo | null,
): Promise<GeneratedTexts> {
  const fallback = fallbackTexts(item, config.business_name);
  if (config.provider === "none" || !config.api_key) return fallback;
  const prompt = textPrompt(item, config);
  try {
    const raw =
      config.provider === "gemini"
        ? await geminiTexts(prompt, config.api_key, photo)
        : config.provider === "openai"
          ? await openaiTexts(prompt, config.api_key, photo)
          : await anthropicTexts(prompt, config.api_key, photo);
    return parseTexts(raw, fallback);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// AI providers — photo enhancement (hybrid pipeline: AI cleans the photo,
// the browser composes the layout deterministically)
// ---------------------------------------------------------------------------

const ENHANCE_PROMPT =
  "Mejora esta foto de producto para un anuncio profesional: aumenta la " +
  "resolución y nitidez (mínimo 1080px de ancho), corrige la iluminación, " +
  "recorta el espacio muerto alrededor del producto de modo que sea el " +
  "protagonista SIN cortar ninguna parte de él, y limpia distracciones del " +
  "fondo manteniendo el entorno reconocible. NO alteres el producto, su " +
  "forma, color, logos ni etiquetas. No agregues texto ni marcas de agua. " +
  "Devuelve solo la imagen.";

async function geminiEnhance(
  photo: Uint8Array,
  mime: string,
  apiKey: string,
  extra: string,
): Promise<Uint8Array | null> {
  const res = await budgetFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${ENHANCE_PROMPT}${extra ? ` ${extra}` : ""}` },
              { inline_data: { mime_type: mime, data: bytesToB64(photo) } },
            ],
          },
        ],
      }),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { data?: string } }[] };
    }[];
  };
  const b64 = data.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data,
  )?.inlineData?.data;
  return b64 ? b64ToBytes(b64) : null;
}

async function openaiEnhance(
  photo: Uint8Array,
  mime: string,
  apiKey: string,
  extra: string,
): Promise<Uint8Array | null> {
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", `${ENHANCE_PROMPT}${extra ? ` ${extra}` : ""}`);
  const buffer = new ArrayBuffer(photo.length);
  new Uint8Array(buffer).set(photo);
  form.append(
    "image",
    new Blob([buffer], { type: mime }),
    mime.includes("png") ? "photo.png" : "photo.jpg",
  );
  const res = await budgetFetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  return b64 ? b64ToBytes(b64) : null;
}

async function fetchPhoto(url: string): Promise<Photo | null> {
  try {
    const res = await budgetFetch(url);
    if (!res.ok) return null;
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      mime: res.headers.get("content-type") ?? "image/webp",
    };
  } catch {
    return null;
  }
}

/** Enhance + re-host the first photo when the provider can do images.
 *  Returns the hosted URL and the enhanced bytes — the bytes matter because
 *  callout targets must be localized on the image the post will display. */
async function enhanceFirstPhoto(
  db: SupabaseClient,
  config: ConfigRow,
  postId: string,
  source: Photo,
): Promise<{ url: string; photo: Photo } | null> {
  try {
    const enhanced =
      config.provider === "gemini"
        ? await geminiEnhance(
            source.bytes,
            source.mime,
            config.api_key,
            config.style_prompt,
          )
        : await openaiEnhance(
            source.bytes,
            source.mime,
            config.api_key,
            config.style_prompt,
          );
    if (!enhanced) return null;
    const path = `${postId}-1.png`;
    const buffer = new ArrayBuffer(enhanced.length);
    new Uint8Array(buffer).set(enhanced);
    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, new Blob([buffer], { type: "image/png" }), {
        contentType: "image/png",
        upsert: true,
      });
    if (error) return null;
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, photo: { bytes: enhanced, mime: "image/png" } };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// cleanup: confirmed posts from finished weeks
// ---------------------------------------------------------------------------

async function cleanupFinishedWeeks(db: SupabaseClient): Promise<number> {
  const weekStart = caracasWeekStart().toISOString();
  const { data, error } = await db
    .from("social_posts")
    .select("id,images")
    .eq("status", "confirmed")
    .lt("scheduled_at", weekStart);
  if (error || !data || data.length === 0) return 0;
  const rows = data as { id: string; images: string[] }[];
  // Only files we host: paths inside the social-posts bucket.
  const marker = `/${BUCKET}/`;
  const paths = rows
    .flatMap((r) => strArray(r.images))
    .filter((url) => url.includes(marker))
    .map((url) => url.slice(url.indexOf(marker) + marker.length));
  if (paths.length > 0) await db.storage.from(BUCKET).remove(paths);
  await db
    .from("social_posts")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
  return rows.length;
}

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

function header(req: Req, name: string): string {
  const value = req.headers[name];
  return typeof value === "string" ? value : "";
}

export default async function handler(req: Req, res: Res) {
  runDeadline = Date.now() + RUN_BUDGET_MS;
  // Module gate (server half of src/app/modules.ts): instances that did not
  // buy Redes run without MODULE_REDES, so this endpoint — and the daily
  // cron that calls it — is a 404 for them. Fail closed: unset = disabled.
  if (process.env.MODULE_REDES !== "true") {
    res.status(404).json({ error: "Módulo no habilitado" });
    return;
  }

  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) {
    res.status(500).json({ error: "Faltan variables de entorno del servidor" });
    return;
  }
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- who is calling ---
  const auth = header(req, "authorization");
  const cronSecret = process.env.CRON_SECRET ?? "";
  const isCron = cronSecret !== "" && auth === `Bearer ${cronSecret}`;
  if (!isCron) {
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const { data: userData, error: userError } = await db.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ error: "Sesión inválida" });
      return;
    }
    const { data: profile } = await db
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if ((profile as { role?: string } | null)?.role !== "admin") {
      res.status(403).json({ error: "Solo administradores" });
      return;
    }
  }

  // --- config + due check ---
  const { data: configData } = await db
    .from("social_config")
    .select("*")
    .maybeSingle();
  const config = (configData as ConfigRow | null) ?? {
    business_name: "MARLA",
    logo_url: "",
    style_prompt: "",
    provider: "none",
    api_key: "",
    cadence_days: 7,
    posts_per_batch: 7,
    post_time: "19:00",
    platforms: ["instagram", "facebook"],
    last_generated_at: null,
  };
  // The migration ships the default row; an instance missing it would have
  // nothing for the claim below to lock on.
  if (!configData) await db.from("social_config").insert({ id: true });

  const cleaned = await cleanupFinishedWeeks(db);

  // How old the last claim must be for this caller to take the turn: a cadence
  // for the cron (minus slack — see DUE_SLACK_MS), the lease for «Generar
  // ahora», which may always run but never on top of a run still in flight.
  const idleFor = isCron
    ? config.cadence_days * 86400000 - DUE_SLACK_MS
    : LEASE_MS;
  const skipped = isCron ? "no toca aún" : "ya hay una generación en curso";
  if (
    config.last_generated_at &&
    Date.now() - new Date(config.last_generated_at).getTime() < idleFor
  ) {
    res.status(200).json({ generated: 0, cleaned, skipped });
    return;
  }

  // --- pick items to promote ---
  await db.storage
    .createBucket(BUCKET, { public: true })
    .catch(() => undefined);

  const [itemsRes, promotedRes, pendingRes] = await Promise.all([
    db
      .from("items")
      .select("id,name,brand,type,notes,quantity,images")
      .gt("quantity", 0),
    db.from("social_promoted").select("item_id,last_promoted_at"),
    db.from("social_posts").select("item_id").neq("status", "confirmed"),
  ]);
  if (itemsRes.error) {
    res.status(500).json({ error: "No se pudo leer el inventario" });
    return;
  }
  const promoted = new Map(
    ((promotedRes.data ?? []) as { item_id: string; last_promoted_at: string }[]).map(
      (r) => [r.item_id, new Date(r.last_promoted_at).getTime()],
    ),
  );
  const pending = new Set(
    ((pendingRes.data ?? []) as { item_id: string | null }[]).map((r) => r.item_id),
  );
  const candidates = (itemsRes.data as ItemRow[])
    .filter((item) => !pending.has(item.id) && item.images.length > 0)
    .sort((a, b) => {
      const pa = promoted.get(a.id) ?? 0;
      const pb = promoted.get(b.id) ?? 0;
      if (pa !== pb) return pa - pb; // least recently promoted first
      return b.quantity - a.quantity; // then more stock first
    })
    .slice(0, config.posts_per_batch);
  if (candidates.length === 0) {
    res.status(200).json({ generated: 0, cleaned });
    return;
  }

  // --- claim the turn ---
  // The config row is the lock, and this update is the only atomic step: the
  // candidates above were read before anyone's inserts landed, so a cron run
  // and «Generar ahora» (or two admin tabs) inside the same window would pick
  // the same items and post them twice. The loser bails here, before spending
  // anything. Stamping last_generated_at now, not after the batch, is also
  // what keeps the cadence from drifting a day per cycle and what stops a run
  // the runtime kills from re-generating the same days every night.
  const claim = await db
    .from("social_config")
    .update({ last_generated_at: new Date().toISOString() })
    .eq("id", true)
    .or(
      `last_generated_at.is.null,last_generated_at.lt."${new Date(
        Date.now() - idleFor,
      ).toISOString()}"`,
    )
    .select("id");
  if (!claim.data || claim.data.length === 0) {
    res.status(200).json({ generated: 0, cleaned, skipped });
    return;
  }

  // --- generate, in parallel; each item degrades independently ---
  const platforms =
    config.platforms.length > 0 ? config.platforms : ["instagram", "facebook"];
  // allSettled, not all: one item throwing must cost its own post, not the
  // whole run — the turn is already claimed, so a rejected batch would burn a
  // cadence for the items that did work.
  const results = await Promise.allSettled(
    candidates.map(async (item, i) => {
      const postId = crypto.randomUUID();
      const originals = item.images.slice(0, 4);
      // Enhancement runs BEFORE the text call on purpose: the text call
      // localizes callout targets on whatever photo the post will show.
      const source = originals.length > 0 ? await fetchPhoto(originals[0]) : null;
      const canEnhance =
        (config.provider === "gemini" || config.provider === "openai") &&
        config.api_key !== "" &&
        source !== null;
      const enhanced = canEnhance
        ? await enhanceFirstPhoto(db, config, postId, source)
        : null;
      const images = enhanced
        ? [enhanced.url, ...originals.slice(1)]
        : originals;
      const texts = await generateTexts(
        item,
        config,
        enhanced?.photo ?? source,
      );
      const { error } = await db.from("social_posts").insert({
        id: postId,
        item_id: item.id,
        item_name: item.name,
        images,
        caption: texts.caption,
        design: texts.design,
        scheduled_at: caracasSlot(i + 1, config.post_time).toISOString(),
        platforms,
        status: "planned",
      });
      if (error) return false;
      await db
        .from("social_promoted")
        .upsert({ item_id: item.id, last_promoted_at: new Date().toISOString() });
      return true;
    }),
  );

  const generated = results.filter(
    (r) => r.status === "fulfilled" && r.value,
  ).length;
  res.status(200).json({ generated, cleaned });
}
