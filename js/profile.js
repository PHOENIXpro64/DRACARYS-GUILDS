import { supabase, requireSupabase, avatarUrl } from "./supabase.js";
import { statusTitle } from "./members.js";

const message = document.querySelector("#profile-message");
const loading = document.querySelector("#profile-loading");
const root = document.querySelector("#profile-root");
let user;
let profile;

function setMessage(text, type = "") { message.textContent = text; message.className = `form-message ${type}`; }
function displayProfile() {
  const avatar = avatarUrl(profile.avatar_path);
  const image = document.querySelector("#avatar-preview");
  const fallback = document.querySelector("#avatar-fallback");
  image.src = avatar || ""; image.hidden = !avatar; fallback.hidden = Boolean(avatar);
  fallback.textContent = (profile.ff_name || profile.username || "D").slice(0, 1).toUpperCase();
  document.querySelector("#profile-username").textContent = profile.username;
  document.querySelector("#ff-name").value = profile.ff_name || "";
  document.querySelector("#ff-uid").value = profile.ff_uid || "";
  const badge = document.querySelector("#membership-badge");
  badge.textContent = statusTitle(profile.membership_status); badge.className = `status-badge status-badge--${profile.membership_status}`;
  document.querySelector("#official-position").textContent = profile.membership_status === "approved" ? (profile.guild_position || "Official member") : "Not an official member";
  document.querySelector("#joined-date").textContent = `Account established ${new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(profile.created_at))}`;
  const request = document.querySelector("#membership-request");
  request.hidden = profile.membership_status === "approved" || profile.membership_status === "pending";
  if (profile.membership_status === "pending") { request.hidden = false; request.querySelector("p").textContent = "Your membership request is with the council."; request.querySelector("button").hidden = true; }
}

async function loadProfile() {
  const client = requireSupabase();
  const { data: authData } = await client.auth.getUser();
  user = authData.user;
  if (!user) { window.location.replace("login.html"); return; }
  const { data, error } = await client.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  profile = data; displayProfile(); loading.hidden = true; root.hidden = false;
}

async function uploadAvatar(file) {
  if (!file) return profile.avatar_path;
  if (!/^(image\/jpeg|image\/png|image\/webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Use a JPG, PNG, or WebP image no larger than 5 MB.");
  const extension = file.name.split(".").pop().toLowerCase();
  const path = `${user.id}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

document.querySelector("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = event.currentTarget.querySelector("button"); button.disabled = true; setMessage("Saving your record…");
  try {
    const avatar_path = await uploadAvatar(document.querySelector("#avatar").files[0]);
    const ff_name = document.querySelector("#ff-name").value.trim();
    const ff_uid = document.querySelector("#ff-uid").value.trim();
    if (ff_uid && !/^\d{4,24}$/.test(ff_uid)) throw new Error("A Free Fire UID must contain 4–24 digits.");
    const { data, error } = await supabase.from("profiles").update({ avatar_path, ff_name: ff_name || null, ff_uid: ff_uid || null }).eq("id", user.id).select().single();
    if (error) throw error; profile = data; displayProfile(); setMessage("Your profile has been saved.", "success");
  } catch (error) { setMessage(error.message, "error"); } finally { button.disabled = false; }
});

document.querySelector("#request-membership").addEventListener("click", async () => {
  const button = document.querySelector("#request-membership"); button.disabled = true; setMessage("Sending your request…");
  try {
    const { error } = await supabase.rpc("request_membership"); if (error) throw error;
    profile.membership_status = "pending"; displayProfile(); setMessage("Your request is now with the council.", "success");
  } catch (error) { setMessage(error.message, "error"); button.disabled = false; }
});

document.querySelector("#sign-out").addEventListener("click", async () => { if (supabase) await supabase.auth.signOut(); window.location.assign("index.html"); });
loadProfile().catch((error) => { loading.textContent = error.message || "We could not load your account."; });
