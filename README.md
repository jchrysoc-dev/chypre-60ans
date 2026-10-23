# A 60th birthday in Cyprus

Private, invite-only website for a week-long 60th birthday celebration in Cyprus (main party: Saturday 29 May 2027).

- **Project brief and rules:** [CLAUDE.md](CLAUDE.md) (also `AGENTS.md`, a symlink to the same file)
- **Settled decisions:** [docs/DECISIONS.md](docs/DECISIONS.md)
- **Content files and fields:** [docs/CONTENT_SCHEMA.md](docs/CONTENT_SCHEMA.md)

## Stack

Astro, server-rendered (content collections with Zod schemas), Tailwind CSS, Supabase (magic-link login and Postgres with Row-Level Security), Vercel, and Vitest with PGlite for database tests.

## Commands

Requires Node 24+. First-time Supabase setup: [docs/SETUP_SUPABASE.md](docs/SETUP_SUPABASE.md). Copy `.env.example` to `.env.local` and fill it in.

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (versions are pinned exactly). |
| `npm run dev` | Local site at http://localhost:4321, reloading on code and content changes. |
| `npm run build` | Check all content (plain-English messages), type-check (`astro check`), and build to `dist/`. Vercel runs this. |
| `npm run check` | The one command for content editors (Mum and her agent): the same as `build`, ending with an "everything looks good" line. Needs no secrets. |
| `npm run photos` | Prepare the photos listed in `content/photos/` (download from Unsplash, or resize your own from `content/photos/originals/`) into `public/photos/`. Run after adding or changing a photo. |
| `npm test` | Tests: content schemas, formatting, colour contrast, and Row-Level Security (real migrations on an in-process Postgres, fake data only). |
| `node --env-file=.env.local scripts/add-admin.ts --email … --name "…"` | **Add an organiser (admin).** Creates their login if needed. Organisers can't be made from the website. |

**Deploy:** Vercel deploys `main` automatically once the GitHub repo is connected (set the three variables from `.env.example` in Vercel → Settings → Environment Variables). Full deployment checklist arrives in M6.

## Where things live

```
content/        editorial content (Markdown + YAML), the only place facts live
docs/           decisions, content schema, (M5) editing guide for Mum
src/lib/        content schemas, Supabase clients, guest-list logic
src/actions/    form handlers (login, guest list)
src/middleware.ts  login check on every request; organiser check on /admin
src/styles/     design tokens (tokens.css): colours, fonts, type scale, spacing
src/pages/      one file per page; renders content, holds no copy of its own
supabase/       migrations (run in order) and fake seed data for tests
scripts/        content checks, photo preparation, and one-off commands for Jacques (add-admin)
tests/          Vitest tests (fake data only)
```
