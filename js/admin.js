import { supabase, requireSupabase, avatarUrl, escapeHtml } from "./supabase.js";

const page = document.body.dataset.adminPage;
const message = document.querySelector("#admin-message");
const content = document.querySelector("#admin-content");
let currentUser;
let allProfiles = [];

function setMessage(text = "", type = "") { message.textContent = text; message.className = `admin-message ${type}`; }
function displayName(profile) { return escapeHtml(profile.ff_name || profile.username); }
function statusLabel(status) { return String(status || "not_member").replace("_", " "); }
function date(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }
function profilePicture(profile) { const url = avatarUrl(profile.avatar_path); return url ? `<img src="${url}" alt="${displayName(profile)}">` : `<span class="member-edit-avatar">${displayName(profile).slice(0, 1).toUpperCase()}</span>`; }

async function fetchProfiles() {
  const { data, error } = await supabase.from("profiles").select("id,username,ff_name,ff_uid,avatar_path,role,membership_status,guild_position,is_leader,created_at").order("created_at", { ascending: false });
  if (error) throw error; allProfiles = data; return data;
}
async function setMembership(id, status) {
  const { error } = await supabase.rpc("admin_set_membership_status", { p_target_id: id, p_membership_status: status });
  if (error) throw error;
}
async function accountAction(action, targetUserId) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: { action, targetUserId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

async function dashboard() {
  const profiles = await fetchProfiles();
  const pending = profiles.filter((p) => p.membership_status === "pending");
  document.querySelector("#stat-accounts").textContent = profiles.length;
  document.querySelector("#stat-members").textContent = profiles.filter((p) => p.membership_status === "approved").length;
  document.querySelector("#stat-pending").textContent = pending.length;
  const list = document.querySelector("#pending-list");
  list.innerHTML = pending.length ? pending.map((p) => `<div class="pending-row"><div><strong>${displayName(p)}</strong><span>${p.ff_uid ? `UID ${escapeHtml(p.ff_uid)} · ` : ""}requested ${date(p.created_at)}</span></div><div class="action-row"><button class="admin-action" data-user-action="approve" data-id="${p.id}">Approve</button><button class="admin-action danger" data-user-action="reject" data-id="${p.id}">Reject</button></div></div>`).join("") : '<p class="empty-state">There are no membership requests waiting for review.</p>';
  list.addEventListener("click", handleUserAction);
}

function userRows(profiles) {
  const tbody = document.querySelector("#users-table");
  tbody.innerHTML = profiles.map((p) => {
    const controls = p.id === currentUser.id ? "<small>Your administrator record</small>" : `<div class="action-row">${p.membership_status !== "approved" ? `<button class="admin-action" data-user-action="approve" data-id="${p.id}">Approve</button>` : ""}${p.membership_status !== "rejected" ? `<button class="admin-action" data-user-action="reject" data-id="${p.id}">Reject</button>` : ""}<button class="admin-action" data-user-action="suspend" data-id="${p.id}">Suspend</button><button class="admin-action danger" data-user-action="delete" data-id="${p.id}">Remove</button></div>`;
    return `<tr><td><strong>${escapeHtml(p.username)}</strong><small>Joined ${date(p.created_at)}${p.role === "admin" ? " · Administrator" : ""}</small></td><td><strong>${displayName(p)}</strong><small>${p.ff_uid ? `UID ${escapeHtml(p.ff_uid)}` : "No UID provided"}</small></td><td><span class="status-pill ${escapeHtml(p.membership_status)}">${escapeHtml(statusLabel(p.membership_status))}</span></td><td>${controls}</td></tr>`;
  }).join("") || '<tr><td colspan="4">No user records found.</td></tr>';
}
async function users() {
  const profiles = await fetchProfiles(); userRows(profiles);
  document.querySelector("#users-table").addEventListener("click", handleUserAction);
  document.querySelector("#user-search").addEventListener("input", (event) => { const q = event.target.value.trim().toLowerCase(); userRows(profiles.filter((p) => [p.username, p.ff_name, p.ff_uid].filter(Boolean).some((value) => value.toLowerCase().includes(q)))); });
}
async function handleUserAction(event) {
  const button = event.target.closest("[data-user-action]"); if (!button) return;
  const { userAction: action, id } = button.dataset;
  if (action === "delete" && !window.confirm("Permanently remove this user account? This cannot be undone.")) return;
  button.disabled = true; setMessage(action === "approve" ? "Approving member…" : "Saving account action…");
  try {
    if (action === "approve") await setMembership(id, "approved");
    else if (action === "reject") await setMembership(id, "rejected");
    else await accountAction(action, id);
    setMessage("Account updated.", "success");
    if (page === "dashboard") await dashboard(); else await users();
  } catch (error) { setMessage(error.message, "error"); button.disabled = false; }
}

function memberCards(profiles) {
  const root = document.querySelector("#member-editor");
  root.innerHTML = profiles.map((p) => `<article class="member-edit-card" data-member="${p.id}">${profilePicture(p)}<div class="member-edit-fields"><label>Account<input value="${escapeHtml(p.username)}" disabled/></label><label>Free Fire name<input data-field="ff_name" value="${escapeHtml(p.ff_name || "")}" maxlength="40"/></label><label>Free Fire UID<input data-field="ff_uid" value="${escapeHtml(p.ff_uid || "")}" maxlength="24" inputmode="numeric"/></label><label>Official position<input data-field="guild_position" value="${escapeHtml(p.guild_position || "Member")}" maxlength="50"/></label><label class="toggle-label wide"><input data-field="is_leader" type="checkbox" ${p.is_leader ? "checked" : ""}/>Feature in leaders section</label><div class="action-row wide"><button class="admin-action" data-member-action="save">Save record</button><button class="admin-action danger" data-member-action="remove">Remove official status</button></div></div></article>`).join("") || '<p class="empty-state">No official guild members yet.</p>';
}
async function members() {
  const profiles = await fetchProfiles(); memberCards(profiles.filter((p) => p.membership_status === "approved"));
  document.querySelector("#member-editor").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-member-action]"); if (!button) return;
    const card = button.closest("[data-member]"); const id = card.dataset.member;
    if (button.dataset.memberAction === "remove") { if (!window.confirm("Remove this person from the official member list?")) return; button.disabled = true; try { await setMembership(id, "not_member"); setMessage("Official status removed.", "success"); await members(); } catch (error) { setMessage(error.message, "error"); button.disabled = false; } return; }
    button.disabled = true; setMessage("Saving official record…");
    try {
      const text = (field) => card.querySelector(`[data-field="${field}"]`).value.trim();
      const uid = text("ff_uid"); if (uid && !/^\d{4,24}$/.test(uid)) throw new Error("A Free Fire UID must contain 4–24 digits.");
      const { error } = await supabase.rpc("admin_update_member", { p_target_id: id, p_ff_name: text("ff_name") || null, p_ff_uid: uid || null, p_guild_position: text("guild_position") || "Member", p_is_leader: card.querySelector('[data-field="is_leader"]').checked });
      if (error) throw error; setMessage("Official record saved.", "success");
    } catch (error) { setMessage(error.message, "error"); } finally { button.disabled = false; }
  });
}

async function media() {
  const profiles = await fetchProfiles();
  const kind = document.querySelector("#media-kind"); const memberWrap = document.querySelector("#media-member-wrap"); const member = document.querySelector("#media-member"); const file = document.querySelector("#media-file");
  member.innerHTML = profiles.filter((p) => p.membership_status === "approved").map((p) => `<option value="${p.id}">${displayName(p)} (${escapeHtml(p.username)})</option>`).join("");
  const adjustFields = () => { const portrait = kind.value === "member"; memberWrap.hidden = !portrait; file.accept = portrait || kind.value === "logo" ? "image/jpeg,image/png,image/webp" : "video/mp4"; };
  kind.addEventListener("change", adjustFields); adjustFields();
  document.querySelector("#media-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button"); const selected = file.files[0]; if (!selected) return;
    const isImage = kind.value === "logo" || kind.value === "member";
    if ((isImage && !/^image\/(jpeg|png|webp)$/.test(selected.type)) || (!isImage && selected.type !== "video/mp4")) return setMessage(isImage ? "Choose a JPG, PNG, or WebP image." : "Choose an MP4 video.", "error");
    if (selected.size > (isImage ? 5 : 100) * 1024 * 1024) return setMessage(isImage ? "Images are limited to 5 MB." : "Videos are limited to 100 MB.", "error");
    button.disabled = true; setMessage("Uploading and publishing…");
    try {
      const extension = selected.name.split(".").pop().toLowerCase();
      if (kind.value === "member") {
        const target = member.value; if (!target) throw new Error("Add an approved member before uploading their portrait.");
        const path = `${target}/official-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, selected, { contentType: selected.type, upsert: false }); if (uploadError) throw uploadError;
        const { error } = await supabase.rpc("admin_set_avatar", { p_target_id: target, p_avatar_path: path }); if (error) throw error;
      } else {
        const path = `site/${kind.value}-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("guild-media").upload(path, selected, { contentType: selected.type, upsert: false }); if (uploadError) throw uploadError;
        const field = { logo: "logo_path", entry: "entry_video_path", background: "background_video_path" }[kind.value];
        const { error } = await supabase.rpc("admin_update_settings", { p_patch: { [field]: path } }); if (error) throw error;
      }
      event.currentTarget.reset(); adjustFields(); setMessage("Media published to the portal.", "success");
    } catch (error) { setMessage(error.message, "error"); } finally { button.disabled = false; }
  });
}

async function settings() {
  const { data, error } = await supabase.from("site_settings").select("*").eq("id", "primary").single(); if (error) throw error;
  document.querySelector("#setting-name").value = data.guild_name || "DRACARYS"; document.querySelector("#setting-description").value = data.description || ""; document.querySelector("#setting-recruitment").value = data.recruitment_text || ""; document.querySelector("#setting-socials").value = (data.social_links?.links || []).join("\n");
  document.querySelector("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button"); const links = document.querySelector("#setting-socials").value.split("\n").map((link) => link.trim()).filter(Boolean);
    try { links.forEach((link) => new URL(link)); } catch (_) { return setMessage("Each social link must be a complete URL beginning with https://.", "error"); }
    button.disabled = true; setMessage("Saving website settings…");
    try { const { error: updateError } = await supabase.rpc("admin_update_settings", { p_patch: { guild_name: document.querySelector("#setting-name").value.trim(), description: document.querySelector("#setting-description").value.trim(), recruitment_text: document.querySelector("#setting-recruitment").value.trim(), social_links: { links } } }); if (updateError) throw updateError; setMessage("Website settings saved.", "success"); } catch (error) { setMessage(error.message, "error"); } finally { button.disabled = false; }
  });
}

async function boot() {
  const client = requireSupabase(message); const { data: { user } } = await client.auth.getUser();
  if (!user) { window.location.replace("../login.html"); return; } currentUser = user;
  const { data: profile, error } = await client.from("profiles").select("role").eq("id", user.id).single(); if (error) throw error;
  if (profile.role !== "admin") { window.location.replace("../index.html"); return; }
  content.hidden = false; setMessage(""); document.querySelector(".admin-signout").addEventListener("click", async () => { await client.auth.signOut(); window.location.assign("../index.html"); });
  await ({ dashboard, users, members, media, settings })[page]();
}
boot().catch((error) => setMessage(error.message || "The command center could not be loaded.", "error"));
