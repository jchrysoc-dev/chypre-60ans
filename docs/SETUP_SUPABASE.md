# Setting up Supabase (one-time, for Jacques)

About 20 minutes. Everything here happens in the Supabase dashboard and your Gmail settings; no terminal needed until step 7.

## 1. Create the project

1. https://supabase.com/dashboard → **New project**, free plan.
2. Name: `chypre-60ans`. **Region: Central EU (Frankfurt)**, so guests' data stays in the EU (GDPR).
3. Save the database password in your password manager (you won't need it day to day).

## 2. Create the tables

1. **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/migrations/20261023120000_households_people_rsvps.sql`](../supabase/migrations/20261023120000_households_people_rsvps.sql) → **Run**. It should say "Success. No rows returned".
3. Later migrations: run each new file in `supabase/migrations/` once, in date order.

**Never run `supabase/seed.sql` here.** It is fake data for tests only.

## 3. Switch off public sign-up (important)

**Authentication → Sign In / Providers**:

- **Allow new users to sign up: OFF.** Logins are created by the website when Mum adds someone to the guest list, so nobody else can ever get in.
- **Email** provider: enabled.

## 4. Website addresses

**Authentication → URL Configuration**:

- **Site URL:** the live address, e.g. `https://chypre-60ans.vercel.app` (use `http://localhost:4321` until it's deployed).
- **Redirect URLs:** add both
  - `http://localhost:4321/auth/confirm`
  - `https://chypre-60ans.vercel.app/auth/confirm` (your real Vercel address)

## 5. Sending emails from the dedicated Gmail account

Supabase's built-in mailer only sends a handful of emails per hour, so login emails go through the event's Gmail account (yours or Mum's, whichever you choose).

In that **Google account**:

1. Turn on **2-Step Verification** (https://myaccount.google.com/security).
2. Create an **App password** (https://myaccount.google.com/apppasswords), name it "Birthday website". Copy the 16 letters.
APP_PASSWORD = buuq cqxb ysau gnzz


In Supabase, **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**:

| Field | Value |
|---|---|
| Sender email | the Gmail address |
| Sender name | `Birthday in Cyprus` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the Gmail address |
| Password | the 16-letter app password |

Then **Authentication → Rate Limits**: set "emails sent per hour" to **100**.

Note: copies of every login email will appear in that Gmail account's "Sent" folder, and guests who reply to a login email will reach it.

## 6. The login email

**Authentication → Emails → Templates → Magic Link**.

Subject:

```
Your link to the birthday website
```

Body (replace everything):

```html
<h2>Your link to the birthday website</h2>
<p>Hello! Tap the button below to log in. There is no password.</p>
<p>
  <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email"
     style="display:inline-block;padding:14px 28px;background:#1f5c8a;color:#fffdf8;border-radius:6px;font-size:18px;font-weight:bold;text-decoration:none">
    Log in
  </a>
</p>
<p>The link works once. If it has expired, simply ask for a new one on the website.</p>
<p>If you did not ask for this email, you can ignore it.</p>
```

The link points to `/auth/confirm`, which asks for one more tap on **Log in**. That extra tap stops email security scanners from using up the link before the guest opens it.

Recommended: **Authentication → Sign In / Providers → Email → Email OTP Expiration**: `21600` (6 hours), so a guest who opens the email later in the day can still use it.

## 7. Keys for the website

**Project Settings → API Keys**: copy the **publishable** key (`sb_publishable_…`) and create/copy a **secret** key (`sb_secret_…`).

`SUPABASE_URL` is the **project URL**, shaped `https://<project-ref>.supabase.co`. It is **not** the address of the dashboard page in your browser (`https://supabase.com/dashboard/project/<project-ref>`). The `<project-ref>` is the same code in both. You can also copy the project URL from the **Connect** button at the top of the dashboard.

Check the whole setup at any time (read-only; prints no keys):

```sh
node --env-file=.env.local scripts/check-supabase.ts
```

1. Copy `.env.example` to `.env.local` and fill in the three values.
2. Make the organisers:

   ```sh
   node --env-file=.env.local scripts/add-admin.ts --email you@example.com --name "Jacques"
   node --env-file=.env.local scripts/add-admin.ts --email you@example.com --name "Isabelle"
   ```

3. `npm run dev`, open http://localhost:4321, log in with your email, and open **Guest list** in the footer.

## 8. Keep the project awake

Free Supabase projects pause after a week without activity. In GitHub → the repo → **Settings → Secrets and variables → Actions**, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The workflow in `.github/workflows/supabase-keepalive.yml` then calls the database every 3 days.

## Check that it works

- [ ] Logging in with your own email works and shows the welcome page.
- [ ] An email address that is **not** on the guest list gets the same "Check your email" page but **no email**.
- [ ] Mum adds a fake household with your second email address; that address can log in and sees **no** Guest list link.
- [ ] Removing that household makes the second address unable to log in again.
