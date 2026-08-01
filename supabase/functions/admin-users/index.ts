import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData?.user) return json({ error: "NOT_AUTHENTICATED" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerProfile, error: profileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .single();
  if (profileErr || callerProfile?.role !== "admin") {
    return json({ error: "NOT_AUTHORIZED" }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_BODY" }, 400);
  }

  const { action } = body;

  if (action === "create") {
    const { name, email, password, role, canEditPrice } = body;
    if (!name || !email || !password || password.length < 6 || !["admin", "seller"].includes(role)) {
      return json({ error: "INVALID_INPUT" }, 400);
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) return json({ error: "EMAIL_EXISTS" }, 409);
      return json({ error: error.message }, 400);
    }
    await admin
      .from("profiles")
      .update({ name, role, can_edit_price: !!canEditPrice })
      .eq("id", data.user!.id);
    return json({ id: data.user!.id });
  }

  if (action === "update") {
    const { id, name, email, password, role, canEditPrice } = body;
    if (!id) return json({ error: "INVALID_INPUT" }, 400);

    const authUpdate: Record<string, unknown> = {};
    if (email) authUpdate.email = email;
    if (password) {
      if (password.length < 6) return json({ error: "INVALID_INPUT" }, 400);
      authUpdate.password = password;
    }
    if (Object.keys(authUpdate).length > 0) {
      const { error } = await admin.auth.admin.updateUserById(id, authUpdate);
      if (error) {
        if (error.message.toLowerCase().includes("already")) return json({ error: "EMAIL_EXISTS" }, 409);
        return json({ error: error.message }, 400);
      }
    }

    const profileUpdate: Record<string, unknown> = {};
    if (name) profileUpdate.name = name;
    if (role && ["admin", "seller"].includes(role)) profileUpdate.role = role;
    if (email) profileUpdate.email = email;
    if (typeof canEditPrice === "boolean") profileUpdate.can_edit_price = canEditPrice;
    if (Object.keys(profileUpdate).length > 0) {
      await admin.from("profiles").update(profileUpdate).eq("id", id);
    }
    return json({ ok: true });
  }

  if (action === "delete") {
    const { id } = body;
    if (!id) return json({ error: "INVALID_INPUT" }, 400);
    if (id === callerData.user.id) return json({ error: "CANNOT_DELETE_SELF" }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "UNKNOWN_ACTION" }, 400);
});
