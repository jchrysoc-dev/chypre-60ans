# Decisions log

Every settled question about this project, so later sessions (and other LLMs) don't re-ask or re-decide.
Format: date · question → answer · why. "Default" means Claude proposed it and Jacques has not objected yet; change it here if needed.

## Event & content

| Date | Question | Answer | Why |
|---|---|---|---|
| 2026-10-23 | Date and format | **Saturday 29 May 2027**, main party, inside a **full week** of activities in Cyprus. Exact week dates TBD. | Confirmed by Jacques. |
| 2026-10-23 | Venue, address, start time, dress code | **Unknown yet.** Use clearly marked placeholders in `content/event.yaml` (`TBD`) until Mum fills them in. | Not decided by the family yet. |
| 2026-10-23 | Time zone | `+03:00` (Cyprus summer time, EEST) on all ISO 8601 datetimes. | Cyprus is on EEST in May. |
| 2026-10-23 | Guest count | **30–60 guests**, every adult has an email. | Confirmed. No proxy-login flow needed. |
| 2026-10-23 | Accommodation | **Guests book themselves.** The site lists suggested options, and each guest can optionally say where they stay (one of the listed options, or "other"). | Helps car-sharing without Mum managing bookings. |
| 2026-10-23 | What guests tell us | **Party RSVP**, **dietary requirements**, **arrival/departure dates**, **flight details** (for transfers). | Confirmed. |
| 2026-10-23 | Activity features | **Optional capacity per activity + automatic waitlist** (first in line is promoted when a place frees up). **Cost per person shown in EUR**, information only, no online payment. No sign-up deadline. | Confirmed. Deadlines weren't selected and can be added later. |
| 2026-10-23 | Children | Not explicitly stated. **Default:** household members can include people without email (e.g. children) whom another member registers. | Covered by the household model at no extra cost. |

## Logins & access

| Date | Question | Answer | Why |
|---|---|---|---|
| 2026-10-23 | Login method | **Magic link by email**, no passwords, long-lived sessions. | Easiest for a 50+ audience. |
| 2026-10-23 | Who creates accounts | **Mum pre-loads an invite list** in `/admin`. Only listed emails can log in. | Private event, no approval queue. |
| 2026-10-23 | Household vs person | **Household-based:** each person logs in with their own email, but belongs to a household. Any adult member can RSVP and sign up the others (including members without email). | Couples and families answer once. |
| 2026-10-23 | Admins | **Mum + Jacques, fixed.** Admin role is granted by a documented command or seed, not from the UI. | Small blast radius. |

## Editing (Mum)

| Date | Question | Answer | Why |
|---|---|---|---|
| 2026-10-23 | What Mum knows | **Google Docs / Sheets.** | Decides the editing route. |
| 2026-10-23 | What Mum edits | **All page text, activities, guest list/invites.** Photos are not required for her to edit, so Jacques handles them. | Confirmed. |
| 2026-10-23 | Editing route | **Google Sheets + Google Docs, synced to `content/` files.** Structured items (event facts, activities, accommodation, Cyprus resource links) are rows in one Google Sheet. Long texts (Welcome, Cyprus articles, longer descriptions) are one Google Doc each. | Uses tools Mum already knows. Content still ends up as plain files in Git (principle §3.1). |
| 2026-10-23 | Publish trigger | **"Publish" menu button in the Sheet** (Apps Script) triggers a GitHub Action. It reads Sheet + Docs, validates, writes `content/`, commits and Vercel deploys. Errors are written back in plain English to a `Status` tab. | Mum decides when changes go live, so half-finished edits stay private. |
| 2026-10-23 | Long text location | **Google Docs, one per page**, converted to Markdown by the sync. | Real formatting (headings, bold, links) that cells can't do. |
| 2026-10-23 | Guest list location | **Site `/admin` only (Supabase).** Never in Git, never in the content Sheet. CSV export opens in Sheets. | Keeps personal data out of the repo (principle §3.4). |
| 2026-10-23 | Google file ownership | **Jacques owns** the Sheet and Docs and shares edit access with Mum. The sync reads them through a Google Cloud service account (read-only share). | Jacques controls the technical side. |
| 2026-10-23 | Announcements | **None from the site.** Mum uses WhatsApp/email herself. `/admin` offers "copy opted-in emails" + CSV. | No email-sending infrastructure beyond login. |

## Participants page & privacy

| Date | Question | Answer | Why |
|---|---|---|---|
| 2026-10-23 | Directory fields | Each one opt-in per person: **email**, **phone/WhatsApp**, **city/country**, **staying at**, **arrival/departure dates**. No photo or bio. | Confirmed. Sharing travel dates helps people coordinate. |
| 2026-10-23 | Dietary + flight details | **Admin-only + own household.** Never on the Participants page. Dietary needs require an explicit consent checkbox (GDPR special-category / health data). | Privacy first. |
| 2026-10-23 | WhatsApp group | **Yes.** Invite link shown only to logged-in guests, stored as a server-only env var (not in Git). | Easy guest-to-guest communication. |
| 2026-10-23 | After the party | **Thank-you page + link to a shared photo album, then archive.** **Default:** all personal data deleted by **2027-08-31**, and the site becomes a static memento with no personal data. | Confirmed. Deletion date is a default. |
| 2026-10-23 | Indexing | `noindex, nofollow` everywhere + `robots.txt` disallow all. `llms.txt` is served behind login. | From brief §3. |

## Design & tech

| Date | Question | Answer | Why |
|---|---|---|---|
| 2026-10-23 | Look & feel | **Warm Mediterranean, elegant:** sea blue, terracotta, olive, cream. Serif headings, sans-serif body, base font ≥ 18px. | Confirmed. |
| 2026-10-23 | Domain | **Free `*.vercel.app` subdomain.** | €0, and the site isn't indexed anyway. |
| 2026-10-23 | Budget | **€0, free tiers only.** | Confirmed. |
| 2026-10-23 | Framework | **Astro, server-rendered on Vercel** (`@astrojs/vercel`), with content collections + Zod schemas. | Content-as-files with typed validation, so the build fails on bad content. Every page is behind a login, so it needs SSR. |
| 2026-10-23 | Auth + data | **Supabase** (Auth magic link + Postgres with Row-Level Security), free tier. | From the brief's default. Guests edit only their own household's rows. |
| 2026-10-23 | Styling | **Tailwind CSS**, mobile-first. | From the brief's default. |
| 2026-10-23 | Repo layout | Move the brief to `./CLAUDE.md`, symlink `AGENTS.md` to it, `git init`, private GitHub repo connected to Vercel. | Claude Code only auto-loads a file named `CLAUDE.md`. |
| 2026-10-23 | Login email sender | **Open, decide in M2.** Supabase's built-in mailer is rate-limited and for testing only. Resend's free tier needs a verified domain, which we don't have. **Default proposal:** a dedicated Gmail account (e.g. for the party) used as Supabase custom SMTP with an app password, or Brevo free tier with a single verified sender. | €0 and no custom domain rule out the usual choice. |

## Build log

| Date | Question | Answer | Why |
|---|---|---|---|
| 2026-10-23 | Plan approval | Jacques approved the plan ("Start building"). M1 started. | — |
| 2026-10-23 | Dependency versions | Pinned exactly, each release at least 2 weeks old: Astro 7.3.8, Tailwind 4.3.3, Vitest 5.0.3, TypeScript 6.0.3. | Avoid brand-new releases and surprise upgrades. |
| 2026-10-23 | Date-time precision | Minutes only, with offset: `"2027-05-29T19:00+03:00"`. Seconds are rejected. | One canonical format, matching the brief. |
| 2026-10-23 | `event.yaml` loading | Custom loader instead of Astro's `file()` loader. | `file()` only logs YAML errors. The custom loader fails the build. |
| 2026-10-23 | Standalone pages | `content/welcome.md`, `thank-you.md`, `privacy.md` form a `pages` collection. | Privacy notice and thank-you page are content too. |
| 2026-10-23 | Fonts | Lora (headings) + Source Sans 3 (body), self-hosted via Fontsource. | No requests to Google Fonts, which would send guests' IP addresses to Google (GDPR). |
| 2026-10-23 | Known audit warning | `@tailwindcss/typography` pulls in a `postcss-selector-parser` with a moderate CPU-exhaustion advisory. Build-time only, our own CSS only. Accepted. Re-check before launch. | The only "fix" npm offers downgrades to an incompatible version. |
