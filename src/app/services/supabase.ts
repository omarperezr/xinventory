import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://oedxootuknbvrcghjywp.supabase.co";
const SUPABASE_KEY =
  "sb_publishable__FMLYbpt2NW0hEHuibts5w_hy-CwtCC";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const PRODUCT_IMAGES_BUCKET = "product-images";
