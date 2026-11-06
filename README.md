# DRACARYS — Free Fire Guild Portal

DRACARYS is a responsive, cinematic guild portal built with plain HTML, CSS, JavaScript, Supabase Auth, PostgreSQL, Storage, and a protected Supabase Edge Function.

## Included

- A user-interaction-safe, skippable opening cinematic with fullscreen and landscape requests where the browser allows them.
- Public guild home, legacy, leaders, approved member roster, and recruitment content.
- Username/password account registration, sign-in, personal profiles, avatar uploads, and membership requests.
- A private administrator dashboard for user review, official member records, media publishing, and website settings.
- Database schema, Row Level Security policies, storage policies, and a server-side account suspension/deletion function.

## 1. Add the Supabase project values

1. Create a new project at [Supabase](https://supabase.com/dashboard).
2. Open **Project Settings → API** and copy the Project URL and the **anon / publishable** key.
3. Open [js/supabase.js](js/supabase.js) and replace only these placeholders:

   ```js
   const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```

Never place the `service_role` key in this project or any browser code.

### About username authentication

The requested account form uses username + password only. Supabase Auth identifies email/password accounts by email, so the portal safely derives an internal address in the form `username@dracarys.guild`; it is never displayed in the interface. In Supabase **Authentication → Providers → Email**, turn **Confirm email** off for this setup. This enables immediate username sign-in. If you want account recovery by email, add an explicit email field and enable confirmation before going live.

## 2. Set up database and storage

1. In Supabase, open **SQL Editor**.
2. Paste and run the full [supabase/schema.sql](supabase/schema.sql) file once.
3. It creates the `profiles` and `site_settings` tables, `avatars` and `guild-media` buckets, the registration trigger, restricted functions, and all Row Level Security policies.

The schema grants users access only to their own editable fields. Role, approval state, leader status, guild position, and all admin actions are modified only inside security-definer functions that verify the signed-in caller is an administrator.

## 3. Create the initial administrator securely

1. Serve the site locally (see below) and register your normal administrator username.
2. In the Supabase SQL Editor, run this once, replacing the username exactly:

   ```sql
   update public.profiles
   set role = 'admin', membership_status = 'approved',
       guild_position = 'Guild Leader', is_leader = true
   where username = 'your_exact_username';
   ```

3. Sign out and sign back in. The **Admin** item will appear in the main navigation.

There is deliberately no public admin registration route and no credential in source code.

## 4. Deploy protected account actions

The user suspension and permanent account deletion buttons call a Supabase Edge Function. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), log in, link your project, then deploy it:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-users
```

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. Add the anon key as a function secret if it is not already available:

```powershell
supabase secrets set SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

The Edge Function validates the caller’s session, checks the caller’s database role with the service key on the server, forbids self-removal, and only then invokes the Auth admin API. The service key never reaches the browser.

## 5. Assets

The supplied assets are already wired to these paths:

| File | Used for |
| --- | --- |
| `assets/logo.png` | Header, auth, and dashboard branding |
| `assets/entry.mp4` | First-visit cinematic |
| `assets/background.mp4` | Looping public-page background |

The **Media** section in the admin dashboard can later replace the logo and videos in Supabase Storage; those published versions take priority over the local fallback assets.

## 6. Run locally

This is a static frontend: open it through a local web server, not by double-clicking the HTML file. For example, from the project folder:

```powershell
py -m http.server 8080
```

Then visit `http://localhost:8080`. In Supabase **Authentication → URL Configuration**, add that URL to the allowed Site URL / Redirect URLs during development. Add the production URL before deployment.

## Deploy

Deploy the project folder to Netlify, Vercel static hosting, GitHub Pages, Cloudflare Pages, or any HTTPS static host. Set the deployed URL in Supabase Auth URL Configuration. HTTPS is required for the most reliable fullscreen and orientation-lock behavior.

## Security notes

- The browser receives only the anon key; RLS remains active on every table and storage object.
- A profile update has column-level grants only for `avatar_path`, `ff_name`, and `ff_uid`.
- The browser cannot update roles, ranks, official status, settings, or guild media directly.
- Public pages show approved official members only; pending and rejected records stay private from visitors.
- Client-side media validation improves feedback; bucket MIME and size restrictions plus Storage RLS enforce it at the server.
- For a production launch, periodically remove obsolete media objects through the Supabase dashboard to control storage usage.
