import { supabase, avatarUrl, escapeHtml } from "./supabase.js";

const entry = document.querySelector("#entry");
const site = document.querySelector("#site");
const entryVideo = document.querySelector("#entry-video");
let entered = false;

function revealSite() {
  if (entered) return;
  entered = true;
  entry.classList.add("entry--leave");
  site.hidden = false;
  setTimeout(() => entry.remove(), 700);
}
async function enterRealm() {
  document.querySelector("#entry-status").textContent = "Entering the dragon kingdom…";
  try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch (_) { /* fullscreen is optional */ }
  try { if (screen.orientation?.lock) await screen.orientation.lock("landscape"); } catch (_) { /* orientation is optional */ }
  entry.classList.add("entry--playing");
  try { await entryVideo.play(); } catch (_) { revealSite(); }
  // Missing or broken supplied media should never trap a visitor on the entry screen.
  setTimeout(() => { if (!entryVideo.duration || Number.isNaN(entryVideo.duration)) revealSite(); }, 1300);
}
document.querySelector("#enter-site").addEventListener("click", enterRealm);
document.querySelector("#skip-entry").addEventListener("click", revealSite);
entryVideo.addEventListener("ended", revealSite);
entryVideo.addEventListener("error", revealSite);

document.querySelector(".menu-toggle").addEventListener("click", (event) => {
  const nav = document.querySelector(".nav"); const open = nav.classList.toggle("nav--open"); event.currentTarget.setAttribute("aria-expanded", String(open));
});
document.querySelectorAll(".nav a").forEach((link) => link.addEventListener("click", () => document.querySelector(".nav").classList.remove("nav--open")));
document.querySelector("#year").textContent = new Date().getFullYear();

function memberCard(member, leader = false) {
  const avatar = avatarUrl(member.avatar_path);
  const safeName = escapeHtml(member.ff_name || member.username);
  const role = escapeHtml(member.guild_position || (leader ? "Guild Leader" : "DRACARYS Member"));
  const uid = member.ff_uid ? `<span>UID ${escapeHtml(member.ff_uid)}</span>` : "";
  return `<article class="member-card${leader ? " member-card--leader" : ""}"><div class="member-image">${avatar ? `<img src="${avatar}" alt="${safeName}" loading="lazy">` : `<span>${safeName.slice(0, 1).toUpperCase()}</span>`}</div><div class="member-info"><p class="member-position">${role}</p><h3>${safeName}</h3>${uid}<span class="member-mark">Official member</span></div></article>`;
}
async function loadPublicData() {
  if (!supabase) return;
  const [{ data: settings }, { data: members, error }] = await Promise.all([
    supabase.from("site_settings").select("guild_name,description,recruitment_text,logo_path,entry_video_path,background_video_path").eq("id", "primary").maybeSingle(),
    supabase.from("profiles").select("username,avatar_path,ff_name,ff_uid,guild_position,is_leader").eq("membership_status", "approved").order("is_leader", { ascending: false }).order("guild_position"),
  ]);
  if (settings) {
    document.querySelectorAll("#brand-name,#footer-name").forEach((node) => node.textContent = settings.guild_name || "DRACARYS");
    document.querySelector("#guild-description").textContent = settings.description || document.querySelector("#guild-description").textContent;
    document.querySelector("#hero-copy").textContent = settings.description || document.querySelector("#hero-copy").textContent;
    document.querySelector("#recruitment-copy").textContent = settings.recruitment_text || document.querySelector("#recruitment-copy").textContent;
    const mediaUrl = (path) => supabase.storage.from("guild-media").getPublicUrl(path).data.publicUrl;
    if (settings.logo_path) document.querySelector("#guild-logo").src = mediaUrl(settings.logo_path);
    if (settings.entry_video_path) { entryVideo.querySelector("source").src = mediaUrl(settings.entry_video_path); entryVideo.load(); }
    if (settings.background_video_path) { const background = document.querySelector("#background-video"); background.querySelector("source").src = mediaUrl(settings.background_video_path); background.load(); background.play().catch(() => {}); }
  }
  if (error || !members) return;
  const leaders = members.filter((member) => member.is_leader);
  document.querySelector("#leaders-grid").innerHTML = leaders.length ? leaders.map((m, index) => memberCard(m, index === 0)).join("") : '<p class="empty-state">The council will be revealed soon.</p>';
  document.querySelector("#members-grid").innerHTML = members.length ? members.map((m) => memberCard(m)).join("") : '<p class="empty-state">No official members have been announced yet.</p>';
  document.querySelector("#member-count").textContent = `${members.length} official ${members.length === 1 ? "member" : "members"}.`;
}
async function syncNavigation() {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  const link = document.querySelector("#auth-link");
  if (!user) return;
  link.textContent = "Profile"; link.href = "profile.html";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "admin") document.querySelector("#admin-link").hidden = false;
}
loadPublicData(); syncNavigation();
