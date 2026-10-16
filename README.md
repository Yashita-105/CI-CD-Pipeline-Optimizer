# Pipeline Optimizer 2.0

A full-stack React + Vite CI/CD monitoring dashboard backed by a small Node.js API and GitHub OAuth.

## What is real now

- GitHub OAuth login (no GitHub token in the browser)
- Live repository discovery from the authenticated GitHub account
- Live GitHub Actions workflow runs and metrics
- Refresh, rerun and cancel GitHub Actions runs
- Workflow dispatch API is available from the backend for future UI controls
- Server-side persistent JSON database for sessions, settings and analyzed run snapshots
- Persistent workspace and notification settings
- Live recommendations calculated from fetched run history
- Vite development proxy and a production Node server that serves `dist`

## Setup

1. Install Node.js 18+.
2. Create a GitHub OAuth App at GitHub Developer Settings.
3. Set the OAuth callback URL to `http://localhost:4000/api/auth/github/callback`.
4. Copy `.env.example` to `.env` and fill in:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `SESSION_SECRET`
5. Install dependencies:

```bash
npm install
```

6. Start frontend + backend:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Production

```bash
npm run build
npm start
```

The Node server serves the Vite `dist` build and the `/api` routes.

## GitHub permissions

The OAuth flow requests `read:user`, `repo`, and `workflow` because private repository discovery and GitHub Actions controls require GitHub authorization. Review the permissions on GitHub's consent screen before approving.

## Persistence

Local persistent state is stored in `server/data/db.json`. It is ignored by Git. For production, replace this adapter with PostgreSQL/SQLite and a managed session store.

## Provider status

GitHub Actions is implemented. GitLab CI/CD and Jenkins are intentionally not represented as connected until their provider adapters are added.
