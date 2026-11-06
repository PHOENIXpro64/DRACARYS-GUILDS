import { supabase, usernameToEmail } from "./supabase.js";

const form = document.querySelector("form");
const message = document.querySelector("#form-message");
const submit = form?.querySelector("button[type=submit]");

function setMessage(text, type = "") { message.textContent = text; message.className = `form-message ${type}`; }
function normalizedUsername(value) { return value.trim().toLowerCase(); }
function validUsername(value) { return /^[a-z0-9_]{3,24}$/.test(value); }

async function goIfSignedIn() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.replace("profile.html");
}

if (form) {
  goIfSignedIn();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabase) return setMessage("The portal has not been connected to Supabase yet. Add the public project URL and anon key in js/supabase.js.", "error");
    const client = supabase;
    const username = normalizedUsername(document.querySelector("#username").value);
    const password = document.querySelector("#password").value;
    const isRegistration = form.id === "register-form";
    if (!validUsername(username)) return setMessage("Choose a username using 3–24 letters, numbers, or underscores.", "error");
    if (password.length < 8) return setMessage("Your password must be at least 8 characters.", "error");
    if (isRegistration && password !== document.querySelector("#confirm-password").value) return setMessage("The passwords do not match.", "error");
    submit.disabled = true;
    setMessage(isRegistration ? "Forging your account…" : "Opening the gates…");
    try {
      if (isRegistration) {
        const { data, error } = await client.auth.signUp({ email: usernameToEmail(username), password, options: { data: { username } } });
        if (error) throw error;
        if (!data.session) {
          setMessage("Your account was created. The portal owner must disable email confirmation for username-only accounts before you can sign in.", "success");
        } else window.location.assign("profile.html");
      } else {
        const { error } = await client.auth.signInWithPassword({ email: usernameToEmail(username), password });
        if (error) throw error;
        window.location.assign("profile.html");
      }
    } catch (error) {
      setMessage(error.message === "Invalid login credentials" ? "That username or password is not recognised." : error.message, "error");
    } finally { submit.disabled = false; }
  });
}
