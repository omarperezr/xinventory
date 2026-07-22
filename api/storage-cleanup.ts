// Vercel serverless function: deletes orphaned files from the Storage
// buckets. The app only ever uploads (image-utils.ts) — deleting an item or
// replacing its photos leaves the old files behind forever. This function is
// the periodic backstop that sweeps them out.
//
// Two callers (same contract as social-generate):
//   * Vercel Cron (weekly, see vercel.json): GET with the CRON_SECRET bearer.
//   * Manual runs: POST with an admin's Supabase JWT.
//
// What a run does, per bucket (product-images, social-posts):
//   1. Collects every URL the database still points at: items.images,
//      social_posts.images (enhancement falls back to original product
//      photos, so posts can reference product-images too) and
//      social_config.logo_url (the logo lives in product-images).
//   2. Lists the bucket and deletes every file that no URL references AND
//      that is older than 48 hours. The age window matters: uploads happen
//      BEFORE the row that references them is saved, so a young unreferenced
//      file may simply be a save in flight — never touch it.
//
// Deletion goes through the Storage API (storage.remove), never SQL on
// storage.objects: a SQL delete drops the record but strands the physical
// file in S3, which is the exact problem this function exists to fix.
//
// Env needed in Vercel: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, and
// VITE_SUPABASE_URL (all already present for social-generate).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

// tsconfig has no Node types (lib is ES2022+DOM); declare the one Node global
// this file needs.
declare const process: { env: Record<string, string | undefined> };

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): { json(body: unknown): void };
}

const BUCKETS = ["product-images", "social-posts"] as const;
const GRACE_MS = 48 * 60 * 60 * 1000; // see header: uploads precede row saves
const LIST_PAGE = 1000;
const REMOVE_CHUNK = 200;

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

// ---------------------------------------------------------------------------
// referenced paths
// ---------------------------------------------------------------------------

/** Every storage path (per bucket) that some database row still points at. */
async function referencedPaths(
  db: SupabaseClient,
): Promise<Map<string, Set<string>>> {
  const [itemsRes, postsRes, configRes] = await Promise.all([
    db.from("items").select("images"),
    db.from("social_posts").select("images"),
    db.from("social_config").select("logo_url").maybeSingle(),
  ]);
  if (itemsRes.error) throw new Error("No se pudo leer el inventario");
  if (postsRes.error) throw new Error("No se pudieron leer las publicaciones");

  const urls = [
    ...(itemsRes.data ?? []).flatMap((r) => strArray(r.images)),
    ...(postsRes.data ?? []).flatMap((r) => strArray(r.images)),
    (configRes.data as { logo_url?: string } | null)?.logo_url ?? "",
  ];

  // Public URLs look like .../storage/v1/object/public/<bucket>/<path>; any
  // URL that doesn't point into one of our buckets is simply ignored.
  const referenced = new Map<string, Set<string>>(
    BUCKETS.map((b) => [b, new Set<string>()]),
  );
  for (const url of urls) {
    for (const bucket of BUCKETS) {
      const marker = `/${bucket}/`;
      const at = url.indexOf(marker);
      if (at >= 0) referenced.get(bucket)!.add(url.slice(at + marker.length));
    }
  }
  return referenced;
}

// ---------------------------------------------------------------------------
// sweep
// ---------------------------------------------------------------------------

interface SweepResult {
  removed: number;
  kept: number;
  errors: number;
}

async function sweepBucket(
  db: SupabaseClient,
  bucket: string,
  referenced: Set<string>,
): Promise<SweepResult> {
  const cutoff = Date.now() - GRACE_MS;
  const orphans: string[] = [];
  let kept = 0;

  // Uploads are flat (uuid.webp / postId-1.png at the root), so one level of
  // listing covers everything; entries without an id are folders, skip them.
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await db.storage
      .from(bucket)
      .list("", { limit: LIST_PAGE, offset });
    if (error) throw new Error(`No se pudo listar el bucket ${bucket}`);
    const entries = data ?? [];
    for (const entry of entries) {
      if (!entry.id) continue; // folder placeholder
      const createdAt = entry.created_at ? Date.parse(entry.created_at) : NaN;
      // Unknown age counts as young: when in doubt, keep the file.
      const isOrphan =
        !referenced.has(entry.name) &&
        Number.isFinite(createdAt) &&
        createdAt < cutoff;
      if (isOrphan) orphans.push(entry.name);
      else kept++;
    }
    if (entries.length < LIST_PAGE) break;
  }

  let removed = 0;
  let errors = 0;
  for (let i = 0; i < orphans.length; i += REMOVE_CHUNK) {
    const chunk = orphans.slice(i, i + REMOVE_CHUNK);
    const { error } = await db.storage.from(bucket).remove(chunk);
    if (error) errors += chunk.length;
    else removed += chunk.length;
  }
  return { removed, kept, errors };
}

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

function header(req: Req, name: string): string {
  const value = req.headers[name];
  return typeof value === "string" ? value : "";
}

export default async function handler(req: Req, res: Res) {
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

  try {
    const referenced = await referencedPaths(db);
    const buckets: Record<string, SweepResult> = {};
    for (const bucket of BUCKETS) {
      buckets[bucket] = await sweepBucket(db, bucket, referenced.get(bucket)!);
    }
    res.status(200).json({ buckets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    res.status(500).json({ error: message });
  }
}
