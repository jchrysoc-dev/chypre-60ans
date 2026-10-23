# A 60th birthday in Cyprus

Private, invite-only website for a week-long 60th birthday celebration in Cyprus (main party: Saturday 29 May 2027).

- **Project brief and rules:** [CLAUDE.md](CLAUDE.md) (also `AGENTS.md`, a symlink to the same file)
- **Settled decisions:** [docs/DECISIONS.md](docs/DECISIONS.md)
- **Content files and fields:** [docs/CONTENT_SCHEMA.md](docs/CONTENT_SCHEMA.md)

## Stack

Astro (content collections + Zod schemas) · Tailwind CSS · Vitest. Supabase (auth + database) and Vercel deployment arrive in M2.

## Commands

Requires Node 24+.

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (versions are pinned exactly). |
| `npm run dev` | Local site at http://localhost:4321, reloading on code and content changes. |
| `npm run build` | Type-check (`astro check`), validate all content, and build to `dist/`. Fails with a readable message if a content file is wrong. |
| `npm run preview` | Serve the built `dist/` locally. |
| `npm test` | Unit tests: content schemas, date/money formatting, colour contrast. |

Deploying and adding an admin are documented once M2 is in place.

## Where things live

```
content/        editorial content (Markdown + YAML), the only place facts live
docs/           decisions, content schema, (M5) editing guide for Mum
src/lib/        content schemas and formatting helpers
src/pages/      one file per page; renders content, holds no copy of its own
tests/          Vitest tests (fake data only)
```
