import { createClient } from "@supabase/supabase-js";

// Configuration comes from environment variables (Vite injects any var prefixed
// with VITE_ at build time). Never hardcode the project URL or key in source.
// The publishable/anon key is safe to ship in the client bundle — access is
// gated by Row Level Security — but it still lives in env, not the repo.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Faltan variables de entorno: define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const PRODUCT_IMAGES_BUCKET = "product-images";
