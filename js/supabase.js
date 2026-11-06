// Public project values only. Never put a Supabase service-role key in this file.
// Copy the values from your Supabase project's Connect dialog.
const SUPABASE_URL = "https://bjixmwuizkgtijaexerk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Y39cDuXoxn4Ya_yKOz1ygQ_6OA3kMET";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const isConfigured = !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

export function requireSupabase(messageTarget) {
  if (supabase) return supabase;
  const message = "The portal has not been connected to Supabase yet. Add the public project URL and anon key in js/supabase.js.";
  if (messageTarget) messageTarget.textContent = message;
  throw new Error(message);
}

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@dracarys.guild`;
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
}

export function avatarUrl(path) {
  if (!path || !supabase) return "";
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
