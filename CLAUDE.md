# CLAUDE.md — Mum's 60th Birthday Website (Cyprus, 29 May 2027)

> Also used as `AGENTS.md` for Codex. Keep both files identical (or make AGENTS.md a symlink to this file).

## 0. How to work on this project — READ FIRST

1. **Start in plan mode.** Do not write, scaffold or install anything until the plan in §7 has been reviewed and explicitly approved by Jacques.
2. **Ask clarifying questions before planning.** Ask as many as needed, grouped by theme (max ~5 per batch), and wait for answers before moving on. Prefer multiple-choice questions with a recommended option marked. Never silently assume an answer to anything listed in §6.
3. Record every decision in `docs/DECISIONS.md` (date, question, answer, why) so later sessions and other LLMs know what was settled.
4. Work in small, reviewable steps. After each milestone, stop, summarise what changed, and say how to check it.
5. Never commit secrets. Use `.env.local` (git-ignored) and document every variable in `.env.example`.

## 1. Context

- **Event:** 60th birthday party of Jacques's mother, in Cyprus, on **29 May 2027** (confirm year).
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
3. **Editing by Mum must not require Git knowledge.** Whatever editing route is chosen (see §6), she edits through a friendly UI; changes go live automatically.
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
| Editorial content editing for Mum | Git-backed CMS (e.g. Keystatic, Decap, TinaCMS, Pages CMS) **or** an in-app `/admin` area | See open question in §6 |
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

**Editing**
- What does Mum already know how to use (Google Docs/Sheets, WordPress, Notion, Canva)? This decides the editing route.
- Which parts must she edit: all text, photos, activities, the guest list?
- Does she need to send announcements/emails to all guests from the site?

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
   - M5 Mum's editing route + `EDITING_GUIDE_FOR_MUM.md`
   - M6 `llms.txt`, JSON-LD, accessibility & mobile pass, deploy
7. Risks and open questions.

## 8. Quality bar

- Mobile-first, WCAG AA contrast, base font ≥ 18px, large tap targets.
- Every page works for a guest who has never used the site, in under 1 minute from the email link.
- Typed content schemas: build fails on malformed content (with a readable error Mum or Jacques can understand).
- Seed data and tests use fake people only.
- Commands documented in `README.md`: install, dev, build, deploy, how to add an admin.

## 9. Commands

Stack: Astro + Tailwind + Vitest (Supabase and Vercel from M2). Details in `README.md`.

- `npm run dev`: local site at http://localhost:4321
- `npm run build`: type-check, validate content, build. **Run before declaring any change done.**
- `npm test`: unit tests (schemas, formatting, contrast)

Content schemas live in `src/lib/content-schemas.ts` and are documented in `docs/CONTENT_SCHEMA.md`. Update both together.
Dependencies are pinned to exact versions at least two weeks old.
