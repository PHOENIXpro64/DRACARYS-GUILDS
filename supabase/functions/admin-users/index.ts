// Deploy with: supabase functions deploy admin-users
// Required function secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// The service-role key stays in the function environment and is never sent to browsers.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Missing authorization header.");
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return Response.json({ error: "Unauthenticated." }, { status: 401, headers: corsHeaders });
    const admin = createClient(url, serviceKey);
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (profileError || profile?.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers: corsHeaders });
    const { action, targetUserId } = await request.json();
    if (!["list", "suspend", "restore", "delete"].includes(action)) throw new Error("Invalid account action.");

    // The browser never receives email addresses or other Auth-only fields.
    if (action === "list") {
      const users = [];
      let page = 1;
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        users.push(...data.users.map((account) => ({ id: account.id, banned_until: account.banned_until })));
        if (data.users.length < 1000) break;
        page += 1;
      }
      return Response.json({ accounts: users }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (typeof targetUserId !== "string") throw new Error("A target account is required.");
    if (targetUserId === user.id) throw new Error("You cannot perform this action on your own administrator account.");
    const { data: targetProfile, error: targetError } = await admin.from("profiles").select("role").eq("id", targetUserId).maybeSingle();
    if (targetError || !targetProfile) throw new Error("Target account was not found.");
    if (targetProfile.role === "admin") throw new Error("Administrator accounts are protected from account actions.");

    if (action === "suspend") {
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "876000h" });
      if (error) throw error;
    }
    if (action === "restore") {
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
      if (error) throw error;
    }
    if (action === "delete") {
      // Auth deletion can fail while a user owns Storage objects. Remove only that
      // account's avatar folder first; the profile then cascades from auth.users.
      const { data: files, error: listError } = await admin.storage.from("avatars").list(targetUserId, { limit: 1000 });
      if (listError) throw listError;
      if (files.length) {
        const { error: removeError } = await admin.storage.from("avatars").remove(files.map((file) => `${targetUserId}/${file.name}`));
        if (removeError) throw removeError;
      }
      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      if (error) throw error;
    }
    return Response.json({ ok: true }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to complete account action." }, { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
