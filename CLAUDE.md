# CLAUDE.md — Mum's 60th Birthday Website (Cyprus, 29 May 2027)

> Also used as `AGENTS.md` for Codex. Keep both files identical (or make AGENTS.md a symlink to this file).

## Part A: Working with Mum (read this first if you are helping Mum)

**Who you are talking to:** assume it is Mum unless the person says they are Jacques (the developer). If it is Jacques, skip Part A and follow Part B (the developer brief, from §0 onwards).

You are helping Jacques's mother edit her 60th birthday website. She is **not technical**. She asks in plain English ("add a sunset cruise on 30 May at 18:00, max 20 people") and you make the change for her.

**How to talk to her**
- Simple, friendly English. No jargon: say "the website", not "the repo"; "save and publish", not "commit and push"; "a problem in the file", not "a schema error".
- One step at a time. Never show her a long list of choices or commands.
- After every change, say in plain words **what changed** and **where she will see it** ("I added the sunset cruise on Sunday 30 May. You'll find it on the Activities page.").

**What you may change**
- Only files in `content/` and photos in `public/photos/` (her own original photos go in `content/photos/originals/`).
- Anything in `src/`, `supabase/`, `scripts/`, `tests/`, `.github/`, anything about logging in, any `.env` file, `package.json`, or any configuration file: **stop, explain in one sentence why you can't, and tell her to ask Jacques.** Do not look for a way around it.
- Never ask her for passwords or keys. Never read, create or edit `.env` files.

**How to add or change things**
- For a new item, copy the template in its folder (`content/activities/_template.md`, `content/accommodation/_template.md`, `content/cyprus/_template.md`, `content/photos/_template.yaml`), and fill it in. The comments in each template explain every field.
- Event facts (date, time, venue, dress code) live **only** in `content/event.yaml`. Never repeat them in another file.
- Never rename an activity file: guests' sign-ups are tied to its file name.
- Never rename an accommodation file either: guests who said they stay there are tied to its file name.
- To cancel an activity, add `status: cancelled` to its file. **Never delete an activity file** (sign-ups are tied to it, and Mum still needs to see who had signed up). If she asks to "remove" an activity, explain this in one sentence and cancel it instead, after her yes.
- Lowering an activity's `capacity` never removes people who already have a place. Raising it gives places to the waiting list automatically once it's published.
- To add a photo of her own: put the picture in `content/photos/originals/`, copy `content/photos/_template.yaml`, run `npm run photos`, then run `npm run check`.

**Never delete without her clear yes**
- Before removing any content file, or anything about guests, ask in plain words ("I'll remove the wine tasting for everyone. Is that OK?") and wait for a clear "yes".

**Privacy**
- Never put guests' names, emails or phone numbers in `content/`.
- The website's files are **public on the internet**. Before adding a photo of identifiable people (especially children) or an exact home address, ask her whether she is happy for it to be public.

**Before publishing**
- Run `git pull` first, then `npm run check`.
- If the check fails, fix it, or explain the problem in plain words and ask her what she'd like. **Never publish a failing check.**

**Publishing**
- First tell her in plain words what you changed and ask: "Shall I publish this now?" Publish only after a clear yes.
- Publishing means: commit with a clear message ("Add sunset cruise on 30 May") and push to `main`. Vercel then updates the website automatically.
- Tell her: "It will be live in about 1 to 2 minutes. Refresh the website to see it."
- If it still hasn't changed after 5 minutes, say so and tell her to message Jacques.

**Guest information** (who has signed up, who is coming, who joined which activity, dietary needs, what guests share on the Participants page) lives in a database, managed on the website's **Organisers** pages (/admin: Guest list, Replies, Activities, Participants). Only guests can switch their own sharing on; Mum can only switch it off. You cannot see it and must not try. Tell her to open the **Organisers** link at the bottom of any page.

**If she says something looks wrong:** offer to undo the last change (a revert), run `npm run check`, and publish it. If the website is still wrong, tell her to message Jacques.

More for her: `docs/EDITING_GUIDE_FOR_MUM.md`. Field-by-field help: `docs/CONTENT_SCHEMA.md`.

---

## Part B: Developer brief (for Jacques's sessions)

## 0. How to work on this project — READ FIRST

1. **Start in plan mode.** Do not write, scaffold or install anything until the plan in §7 has been reviewed and explicitly approved by Jacques.
2. **Ask clarifying questions before planning.** Ask as many as needed, grouped by theme (max ~5 per batch), and wait for answers before moving on. Prefer multiple-choice questions with a recommended option marked. Never silently assume an answer to anything listed in §6.
3. Record every decision in `docs/DECISIONS.md` (date, question, answer, why) so later sessions and other LLMs know what was settled.
4. Work in small, reviewable steps. After each milestone, stop, summarise what changed, and say how to check it.
5. Never commit secrets. Use `.env.local` (git-ignored) and document every variable in `.env.example`.

## 1. Context

- **Event:** 60th birthday party of Jacques's mother, in Cyprus, on **29 May 2027**
- **Client:** Jacques's mother ("Mum"). Non-technical. She must be able to **edit the site herself, easily**, without touching code or a terminal.
- **Developer/owner:** Jacques (bilingual FR/EN, comfortable with AI coding tools, uses the Antigravity IDE).
- **Audience:** Family and friends, many aged 50+, on phones as much as laptops. Logins must be painless.
- **Site language:** English only (code comments and docs also in English).

## 2. Original brief (from Mum, verbatim intent)

- English language
- Personal logins to enter the site
- Pages:
  1. **Welcome** — description of the party itself on 29 May
  2. **Accommodation**
  3. **Activities** — guests can register for each activity
  4. **Participants** — list with contact info so guests can communicate together (Mum will ask each person before publishing their email)
  5. **Resources on Cyprus**
- Mum must be able to modify the site herself easily

## 3. Non-negotiable principles

1. **Content lives in plain files, not in code.** All editorial content (texts, accommodation options, activities, Cyprus resources) lives in `content/` as Markdown with YAML frontmatter or as YAML/JSON. Components only render it.
2. **LLM-readable by design.** Any LLM (Claude, ChatGPT, Gemini…) should be able to read the repo or the site and understand the event fully:
   - one canonical source per fact (date, venue, address, dress code…) in `content/event.yaml`, referenced everywhere else — never duplicated;
   - descriptive file names, consistent schemas, ISO 8601 dates (`2027-05-29T19:00+03:00`), explicit units and currencies;
   - a schema doc in `docs/CONTENT_SCHEMA.md` describing every content file and field;
   - an `llms.txt` (and `llms-full.txt`) generated at build time summarising the public-to-guests content, served **behind login** like the rest of the site;
   - semantic HTML and schema.org `Event` JSON-LD on the welcome page.
3. **Editing by Mum must not require Git knowledge.** She edits by asking an AI agent in plain English (VS Code + Claude Code, see Part A); the agent handles Git, runs `npm run check`, and publishes. Changes go live automatically.
4. **Privacy first (GDPR applies — guests are EU residents and the event is in Cyprus).**
   - Participant contact details are **opt-in per person**, visible **only to logged-in guests**, and each guest can hide/edit their own entry at any time.
   - No personal data in the repo, in `llms.txt`, in logs, or in URLs.
   - `noindex, nofollow` on every page + `robots.txt` disallow all. The site must not appear in search engines.
5. **Simple > clever.** It is a one-off event site with ~30–150 users. Prefer boring, well-documented, free-tier-friendly tools. No microservices.

## 4. Recommended default architecture (to confirm in planning, not to assume)

| Concern | Default proposal | Why |
|---|---|---|
| Framework | **Astro** (with content collections) or **Next.js** (App Router) | Content-as-files, typed schemas, fast static pages |
| Auth | **Supabase Auth, magic-link email** (no passwords); access restricted to an invite list | Easiest for older guests; per-person login as requested |
| Data (registrations, participant profiles) | **Supabase Postgres** with Row-Level Security | Guests can only edit their own rows |
| Editorial content editing for Mum | An agent (Claude Code in VS Code) edits `content/` files, runs `npm run check`, pushes to `main` | Decided 2026-10-23, see `docs/DECISIONS.md` |
| Hosting | **Vercel** (Jacques has an account) | Auto-deploy on content change |
| Styling | Tailwind, warm Mediterranean palette, large readable type, mobile-first | Audience is 50+ and on phones |
| Admin | `/admin` for Mum: guest list/invites, activity headcounts, CSV export | She needs to see who's coming to what |

Roles: `guest`, `admin` (Mum, Jacques).

## 5. Target repo layout (adjust in plan)

```
/content
  event.yaml              # canonical facts: date, time, venue, address, GPS, dress code, contacts
  welcome.md, thank-you.md, privacy.md   # standalone pages
  accommodation/*.md      # one file per option (name, area, price range, booking link, distance to venue)
  activities/*.md         # one file per activity (date, time, meeting point, capacity, cost, deadline)
  cyprus/*.md             # resources: getting there, transport, weather, currency, plugs, emergency numbers…
/docs
  DECISIONS.md
  CONTENT_SCHEMA.md
  EDITING_GUIDE_FOR_MUM.md   # plain-English, screenshots, no jargon
/src                       # app code only — no hard-coded copy
/supabase                  # migrations, RLS policies, seed (fake data only)
CLAUDE.md / AGENTS.md
.env.example
```

## 6. Questions to ask Jacques before planning (minimum list — add more as needed)

**Event & content**
- Confirm the date/year, venue, times, and whether there are several days of events around 29 May.
- Approximate number of guests? Any children? Any guests who don't use email?
- Are accommodation options booked by guests themselves, or allocated by Mum? Should guests indicate where they're staying?
- List of activities known so far? Do they have capacity limits, costs, deadlines, waitlists, +1s/children counts?
- Do guests also need to RSVP to the party itself (and dietary requirements, arrival/departure dates, flight info for transfers)?

**Logins & access**
- "Personal logins": magic link by email (recommended), password, or a shared invite code + name? 
- Who creates accounts: Mum pre-loads an invite list, or guests self-register and Mum approves?
- Can a household share one login, or is it one login per person?

**Editing** (settled 2026-10-23, see `docs/DECISIONS.md` "Editing: agent route")
- Mum edits through an agent (VS Code + Claude Code). Content and photos only; guest data stays on `/admin`.
- No announcements or emails from the site.

**Participants page**
- Which fields are shown (name, email, phone, WhatsApp, city, photo, "staying at", short bio)? 
- Alternative or complement: a WhatsApp group link instead of a public email list?

**Design & tech**
- Look and feel: any colours, photos, theme (Mediterranean, elegant, playful)? A photo of Mum on the home page?
- Domain name wanted (e.g. a custom one) or a free `*.vercel.app` subdomain?
- Budget for paid services (default: €0, free tiers only)?
- Should the site live on after the party (photo sharing, thank-you page) or be archived?

## 7. Expected plan output (before any code)

1. Summary of answers and decisions (also written to `docs/DECISIONS.md`).
2. Chosen stack with one-line justification for each choice, and rejected alternatives.
3. Data model (tables, fields, RLS rules) and content schemas.
4. Page-by-page spec incl. what is editable by Mum and how.
5. Auth & privacy flow, including consent capture for the participants list and data deletion after the event.
6. Milestones with acceptance criteria, e.g.:
   - M1 scaffold + content collections + static pages with placeholder content
   - M2 auth + invite list + protected routes
   - M3 activity registration + admin headcounts/CSV export
   - M4 participants directory with opt-in
   - M5 Mum's agent workflow: `_template` files, `npm run check`, guard-rail settings, `EDITING_GUIDE_FOR_MUM.md`, dry run from a fresh clone
   - M6 `llms.txt`, JSON-LD, accessibility & mobile pass, deploy
7. Risks and open questions.

## 8. Quality bar

- Mobile-first, WCAG AA contrast, base font ≥ 18px, large tap targets.
- Every page works for a guest who has never used the site, in under 1 minute from the email link.
- Typed content schemas: build fails on malformed content (with a readable error Mum or Jacques can understand).
- Seed data and tests use fake people only.
- Commands documented in `README.md`: install, dev, build, deploy, how to add an admin.

## 9. Commands

Stack: Astro (server output, Vercel adapter) + Tailwind + Supabase + Vitest/PGlite. Details in `README.md`; Supabase setup in `docs/SETUP_SUPABASE.md`.

- `npm run dev`: local site at http://localhost:4321
- `npm run build`: validate content, type-check, build. **Run before declaring any change done.**
- `npm run check`: the one command for content editors. Validates content and builds, in plain English. Works without any secrets.
- `npm run photos`: resize and compress photos listed in `content/photos/` into `public/photos/`.
- `npm test`: tests (schemas, formatting, contrast, RLS on PGlite)
- `node --env-file=.env.local scripts/add-admin.ts --email … --name "…"`: add an organiser

Database changes: add a new file in `supabase/migrations/` (never edit one that has been applied), update `src/lib/database.types.ts`, and add RLS tests in `tests/db/`.

Content schemas live in `src/lib/content-schemas.ts` and are documented in `docs/CONTENT_SCHEMA.md`. Update both together.
Dependencies are pinned to exact versions at least two weeks old.
