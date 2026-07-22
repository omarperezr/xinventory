// Redes Sociales: state and persistence for the social posting calendar.
//
// This module is online-first by design, unlike inventory: generating posts
// calls external AI APIs, and posting to Instagram/Facebook requires being
// connected anyway, so there is no outbox here. Reads go straight to Supabase
// (RLS makes every table admin-only — seller accounts get empty results and
// the UI never mounts this provider's consumers for them).
//
// Two kinds of rows:
//   * one `social_config` row: business identity, AI provider + key, cadence.
//   * `social_posts`: the calendar. Status walks planned -> posted ->
//     confirmed by hand; api/social-generate deletes confirmed posts once
//     their week is over.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../services/supabase";
import { useAuth } from "./auth-context";

export type SocialProvider = "none" | "gemini" | "openai" | "anthropic";
export type SocialPostStatus = "planned" | "posted" | "confirmed";
export type SocialPlatform = "instagram" | "facebook";

/** Texts consumed by the deterministic canvas composer (social-composer.ts).
 *  Produced by the AI provider or by fallback templates server-side. */
export interface SocialCallout {
  /** Short uppercase feature label, may contain "\n". */
  label: string;
  /** Where the feature sits on the FIRST photo, as fractions (0–1) of its
   *  width/height. The multimodal provider localizes it; null means "no
   *  visible feature" and the composer draws a short generic line. */
  x: number | null;
  y: number | null;
}

export interface SocialPostDesign {
  /** Category line, e.g. "CASCO ABATIBLE". */
  t1: string;
  /** Big brand/model line, e.g. "ICH". */
  t2: string;
  /** Variant subtitle, e.g. "EDICIÓN ORDANOX". */
  t3: string;
  /** Corner callout boxes (3–4), each pointing at its feature when located. */
  callouts: SocialCallout[];
  /** One-line slogan ending in a period, e.g. "DOMINA EL ASFALTO." */
  statement: string;
}

export interface SocialPost {
  id: string;
  itemId: string | null;
  itemName: string;
  images: string[];
  caption: string;
  design: SocialPostDesign;
  scheduledAt: Date;
  platforms: SocialPlatform[];
  status: SocialPostStatus;
}

export interface SocialConfig {
  businessName: string;
  logoUrl: string;
  stylePrompt: string;
  provider: SocialProvider;
  apiKey: string;
  cadenceDays: number;
  postsPerBatch: number;
  postTime: string;
  platforms: SocialPlatform[];
  lastGeneratedAt: Date | null;
}

interface SocialPostRow {
  id: string;
  item_id: string | null;
  item_name: string;
  images: string[];
  caption: string;
  design: unknown;
  scheduled_at: string;
  platforms: string[];
  status: string;
}

interface SocialConfigRow {
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

const DEFAULT_CONFIG: SocialConfig = {
  businessName: "MARLA",
  logoUrl: "",
  stylePrompt: "",
  provider: "none",
  apiKey: "",
  cadenceDays: 7,
  postsPerBatch: 7,
  postTime: "19:00",
  platforms: ["instagram", "facebook"],
  lastGeneratedAt: null,
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function toPlatforms(value: string[]): SocialPlatform[] {
  return value.filter(
    (p): p is SocialPlatform => p === "instagram" || p === "facebook",
  );
}

function toStatus(value: string): SocialPostStatus {
  return value === "posted" || value === "confirmed" ? value : "planned";
}

function num01(value: unknown): number | null {
  return typeof value === "number" && value >= 0 && value <= 1 ? value : null;
}

/** `design` arrives as untyped jsonb; read it defensively so a malformed
 *  document degrades to empty strings instead of crashing the calendar.
 *  Callouts accept both shapes: plain strings (old rows, fallbacks) and
 *  `{label, x, y}` objects (multimodal generation). */
function mapDesign(value: unknown): SocialPostDesign {
  const doc = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const callouts: SocialCallout[] = [];
  if (Array.isArray(doc.callouts)) {
    for (const entry of doc.callouts) {
      if (typeof entry === "string") {
        callouts.push({ label: entry, x: null, y: null });
      } else if (entry && typeof entry === "object") {
        const c = entry as Record<string, unknown>;
        const label = str(c.label);
        if (label) callouts.push({ label, x: num01(c.x), y: num01(c.y) });
      }
    }
  }
  return {
    t1: str(doc.t1),
    t2: str(doc.t2),
    t3: str(doc.t3),
    callouts,
    statement: str(doc.statement),
  };
}

function mapPost(row: SocialPostRow): SocialPost {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    images: strArray(row.images),
    caption: row.caption,
    design: mapDesign(row.design),
    scheduledAt: new Date(row.scheduled_at),
    platforms: toPlatforms(strArray(row.platforms)),
    status: toStatus(row.status),
  };
}

function mapConfig(row: SocialConfigRow): SocialConfig {
  const provider = row.provider;
  return {
    businessName: row.business_name,
    logoUrl: row.logo_url,
    stylePrompt: row.style_prompt,
    provider:
      provider === "gemini" || provider === "openai" || provider === "anthropic"
        ? provider
        : "none",
    apiKey: row.api_key,
    cadenceDays: row.cadence_days,
    postsPerBatch: row.posts_per_batch,
    postTime: row.post_time,
    platforms: toPlatforms(strArray(row.platforms)),
    lastGeneratedAt: row.last_generated_at ? new Date(row.last_generated_at) : null,
  };
}

type Result = { success: boolean; error?: string };

/** Everything a manually created post needs; the id is minted client-side so
 *  the row lands with the same shape the generator produces. */
export interface NewSocialPost {
  itemId: string | null;
  itemName: string;
  images: string[];
  caption: string;
  design: SocialPostDesign;
  scheduledAt: Date;
  platforms: SocialPlatform[];
}

interface SocialContextValue {
  posts: SocialPost[];
  config: SocialConfig;
  loading: boolean;
  generating: boolean;
  refresh: () => Promise<void>;
  addPost: (input: NewSocialPost) => Promise<Result>;
  saveConfig: (config: SocialConfig) => Promise<Result>;
  updatePost: (
    id: string,
    patch: Partial<Pick<SocialPost, "caption" | "scheduledAt" | "platforms">>,
  ) => Promise<Result>;
  setPostStatus: (id: string, status: SocialPostStatus) => Promise<Result>;
  deletePost: (id: string) => Promise<Result>;
  generateNow: () => Promise<Result>;
}

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Error inesperado";
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [config, setConfig] = useState<SocialConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAdmin) {
      setPosts([]);
      setConfig(DEFAULT_CONFIG);
      return;
    }
    setLoading(true);
    try {
      const [postsRes, configRes] = await Promise.all([
        supabase
          .from("social_posts")
          .select(
            "id,item_id,item_name,images,caption,design,scheduled_at,platforms,status",
          )
          .order("scheduled_at", { ascending: true }),
        supabase.from("social_config").select("*").maybeSingle(),
      ]);
      if (postsRes.error) throw postsRes.error;
      setPosts((postsRes.data as SocialPostRow[]).map(mapPost));
      if (configRes.error) throw configRes.error;
      if (configRes.data) {
        setConfig(mapConfig(configRes.data as SocialConfigRow));
      }
    } catch (err) {
      console.error("No se pudo cargar Redes Sociales", err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  // Same rhythm as the other contexts: initial fetch runs before auth settles
  // and RLS returns nothing, so re-fetch whenever the admin flag flips on.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addPost = useCallback(async (input: NewSocialPost): Promise<Result> => {
    try {
      const id = crypto.randomUUID();
      const { error } = await supabase.from("social_posts").insert({
        id,
        item_id: input.itemId,
        item_name: input.itemName,
        images: input.images,
        caption: input.caption,
        design: input.design,
        scheduled_at: input.scheduledAt.toISOString(),
        platforms: input.platforms,
        status: "planned",
      });
      if (error) throw error;
      // A manual post counts as a promotion for the rotation, same as a
      // generated one — otherwise the next batch would repeat the item.
      if (input.itemId) {
        await supabase.from("social_promoted").upsert({
          item_id: input.itemId,
          last_promoted_at: new Date().toISOString(),
        });
      }
      setPosts((prev) =>
        [...prev, { id, status: "planned" as const, ...input }].sort(
          (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
        ),
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }, []);

  const saveConfig = useCallback(
    async (next: SocialConfig): Promise<Result> => {
      try {
        const { error } = await supabase.from("social_config").upsert({
          id: true,
          business_name: next.businessName,
          logo_url: next.logoUrl,
          style_prompt: next.stylePrompt,
          provider: next.provider,
          api_key: next.apiKey,
          cadence_days: next.cadenceDays,
          posts_per_batch: next.postsPerBatch,
          post_time: next.postTime,
          platforms: next.platforms,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        setConfig(next);
        return { success: true };
      } catch (err) {
        return { success: false, error: errorMessage(err) };
      }
    },
    [],
  );

  const updatePost = useCallback(
    async (
      id: string,
      patch: Partial<Pick<SocialPost, "caption" | "scheduledAt" | "platforms">>,
    ): Promise<Result> => {
      try {
        const row: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (patch.caption !== undefined) row.caption = patch.caption;
        if (patch.scheduledAt !== undefined)
          row.scheduled_at = patch.scheduledAt.toISOString();
        if (patch.platforms !== undefined) row.platforms = patch.platforms;
        const { error } = await supabase
          .from("social_posts")
          .update(row)
          .eq("id", id);
        if (error) throw error;
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        );
        return { success: true };
      } catch (err) {
        return { success: false, error: errorMessage(err) };
      }
    },
    [],
  );

  const setPostStatus = useCallback(
    async (id: string, status: SocialPostStatus): Promise<Result> => {
      try {
        const row: Record<string, unknown> = {
          status,
          updated_at: new Date().toISOString(),
        };
        if (status === "posted") row.posted_at = new Date().toISOString();
        if (status === "confirmed") row.confirmed_at = new Date().toISOString();
        const { error } = await supabase
          .from("social_posts")
          .update(row)
          .eq("id", id);
        if (error) throw error;
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status } : p)),
        );
        return { success: true };
      } catch (err) {
        return { success: false, error: errorMessage(err) };
      }
    },
    [],
  );

  const deletePost = useCallback(async (id: string): Promise<Result> => {
    try {
      const { error } = await supabase.from("social_posts").delete().eq("id", id);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }, []);

  // Manual trigger for the same Vercel function the cron hits. It needs the
  // caller's JWT to verify the admin role server-side (the browser never talks
  // to the AI providers directly — the key must not transit the client).
  const generateNow = useCallback(async (): Promise<Result> => {
    setGenerating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return { success: false, error: "Sesión expirada" };
      const res = await fetch("/api/social-generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: unknown;
        };
        const detail =
          typeof body.error === "string"
            ? body.error
            : `Falló la generación (${res.status})`;
        return { success: false, error: detail };
      }
      await refresh();
      return { success: true };
    } catch {
      return {
        success: false,
        error: "No se pudo contactar el generador. Revisa tu conexión.",
      };
    } finally {
      setGenerating(false);
    }
  }, [refresh]);

  return (
    <SocialContext.Provider
      value={{
        posts,
        config,
        loading,
        generating,
        refresh,
        addPost,
        saveConfig,
        updatePost,
        setPostStatus,
        deletePost,
        generateNow,
      }}
    >
      {children}
    </SocialContext.Provider>
  );
}

export function useSocial(): SocialContextValue {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial debe usarse dentro de SocialProvider");
  return ctx;
}
