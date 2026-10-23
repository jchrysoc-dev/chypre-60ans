# Setting up Mum's editing (for Jacques)

How Mum edits: [docs/EDITING_GUIDE_FOR_MUM.md](EDITING_GUIDE_FOR_MUM.md). The agent's rules: "Part A" at the top of [CLAUDE.md](../CLAUDE.md). Why: [docs/DECISIONS.md](DECISIONS.md), "Editing: agent route".

## Checklist

### 1. Before making the repo public
Public is needed because Vercel's free (Hobby) plan blocks deploying a private repo when the commit author isn't the account owner (see "Risks"). Checked on 2026-10-23, read-only:
- **Secrets:** none in the history. No `.env` file was ever committed, no key-shaped strings, the only Supabase URL is the example placeholder in the docs. (`service_role` appears only as the Postgres role name.)
- **Personal data:** none in tracked files. Only default addresses in `supabase/config.toml` and a test string.
- **Your email address is the author of every commit** (`jchrysostomou1@gmail.com`) and would become public. Decide:
  - Accept it, or
  - Switch to your GitHub no-reply address (GitHub → Settings → Emails) and rewrite the 7 existing commits **before** making the repo public:
    ```
    git config user.email "ID+jchrysoc-dev@users.noreply.github.com"
    git rebase -r --root --exec "git commit --amend --no-edit --reset-author"
    git push --force-with-lease origin main
    ```
    (The first commit is already on GitHub, so this needs one force-push. Nobody else has a copy yet.) Also tick "Block command line pushes that expose my email" in the same GitHub page.
- Re-run the scan before going public if more commits were added. Never put guest data, keys or a venue you want to keep private into `content/`.

### 2. GitHub
1. Settings → General → bottom of the page → **Change visibility → Public**.
2. Settings → Collaborators → add Mum's account with the **Write** role.
3. Settings → Rules → new ruleset for `main`: **block force pushes** and **restrict deletions**. Don't require pull requests (Mum pushes straight to `main`).
4. Watch the repo (Watch → All activity) so you get an email on every push, and from the "Check the website" workflow if it fails.

### 3. Vercel
1. Import the GitHub repo. Production branch `main`. Build command `npm run build`.
2. Add the three variables from `.env.example` (Production).
3. Settings → Notifications: turn on failed-deployment emails.
4. **Test push as Mum before relying on this** (see "Risks"): have her make a harmless change from her own GitHub account and confirm it deploys. Then ask the agent to undo it.

### 4. Mum's account on the website
Make her an organiser so she gets the Guest list page: `node --env-file=.env.local scripts/add-admin.ts --email … --name "…"`.

### 5. The setup call (about 45 minutes)
Follow Part 1 of the guide together. Check:
- Her `.claude/settings.local.json` exists (it is git-ignored). In her Claude Code, `/permissions` should show the allow and deny lists.
- **Test the guard-rails:** ask the agent to "change the colours of the website". It should refuse and say to ask you. Ask it to "add a test activity", then undo it.
- `npm run check` passes on her computer without any secrets.

### 6. Your own sessions
Her agent follows Part A of `CLAUDE.md` unless the person says they are Jacques. Say so at the start of your sessions, or add a line to your own `~/.claude/CLAUDE.md` ("I'm Jacques, the developer: follow Part B of the project's CLAUDE.md").

### 7. Keys
Give Mum **no** `.env.local`, no Supabase or Vercel login. You stay the only holder of keys.

## Risks

- **Public repo.** Event details, schedule, hotels and photos are visible to anyone. Guest data is not (it lives in Supabase). Photos in `public/photos/` are public even without a login. The agent is told to ask Mum before adding photos of identifiable people or an exact address.
- **The Vercel rule is from forum posts, not official docs.** I couldn't find it stated in Vercel's own documentation, so the test push in step 3.4 is what settles it. If it does block, the alternatives are Vercel Pro (about $20 a month) or deploying through a GitHub Action with your token (unverified: reports say CLI deploys are blocked too).
- **The guard-rails are a seat belt, not a wall.** `docs/mum-claude-settings.json` limits what the agent's own tools may edit, but Claude Code's own docs say rules aren't enforced for commands run through other programs (for example scripts started by `npm run` or `node`). GitHub's free plan can't restrict Mum's pushes to `content/`. The real protections are: the agent's rules, the check that fails the Vercel build (a failing build keeps the last good version live), the emails to you, and git undo. Content that is valid but wrong (a wrong time) does go live.
- **Unverified details of the settings file.** I haven't run it on a real Claude Code install: that `defaultMode: "dontAsk"` refuses unlisted actions as intended, and whether `defaultMode` set in a local settings file overrides a project one. Check with `/permissions` during the setup call. If `dontAsk` is too strict in practice, change it to `"default"`.
- **Activity file names are IDs.** Sign-ups will be stored against them (M3). The agent can't see Supabase, so it can't check whether an activity has sign-ups before renaming or deleting it. It is told never to rename one and to ask before deleting. Proposal for M3: a `status: cancelled` field instead of deleting.
- **Two editors, one `main`.** The agent runs `git pull` before editing. If you and Mum push at the same time you may get a conflict.
- **Windows.** `AGENTS.md` is a symlink and arrives as a plain file on her computer. That's harmless since she uses Claude Code. PowerShell may block `npm` (the guide has the one-line fix).
- **GitHub Actions versions.** `.github/workflows/check.yml` uses `actions/checkout@v4` and `actions/setup-node@v4` (version tags, not exact pins as for npm packages).
