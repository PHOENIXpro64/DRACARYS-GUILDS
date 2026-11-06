import { escapeHtml, avatarUrl } from "./supabase.js";

export function statusTitle(status) {
  return ({ not_member: "Visitor", pending: "Application pending", approved: "Official member", rejected: "Application declined" })[status] || "Visitor";
}

export function profileAvatar(profile) {
  return avatarUrl(profile?.avatar_path);
}

export function safeProfileName(profile) {
  return escapeHtml(profile?.ff_name || profile?.username || "DRACARYS");
}
