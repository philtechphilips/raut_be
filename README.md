# Rauts Backend

NestJS backend for authentication, API project sync, AI enrichment, request history, and GitHub import/scan jobs.

## Tech stack

- NestJS 10
- TypeORM + MySQL
- BullMQ + Redis (GitHub scan queue)
- OpenAI (AI enrichment/project analysis)
- Resend (transactional email)

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Create `.env` in `app/backend` (see required keys below).

3. Start development server:

```bash
npm run dev
```

4. Build / production run:

```bash
npm run build
npm run start
```

Server default:

- `http://localhost:3001`
- Global API prefix: `/api`

## Environment variables

Core:

- `PORT` (default `3001`)
- `JWT_SECRET` (required in non-local environments)

MySQL:

- `DB_HOST` (default `localhost`)
- `DB_PORT` (default `3306`)
- `DB_USERNAME` or `DB_USER` (default `root`)
- `DB_PASSWORD`
- `DB_NAME` (default `routiq_db`)

Redis (BullMQ queue):

- `REDIS_URL` (recommended)
- or `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`
- `GITHUB_SCAN_CONCURRENCY` (default `3`)

GitHub OAuth / GitHub import:

- `GITHUB_OAUTH_STATE_SECRET` (optional; if unset, **`JWT_SECRET` must match** what Passport/JWT uses — both OAuth **state** and JWT default dev fallback now use `JWT_SECRET` or `routiq_super_secret_key`)
- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `GITHUB_OAUTH_CALLBACK_URL` (optional; fallback uses `API_PUBLIC_URL`)
- `GITHUB_OAUTH_SCOPES` (optional; default `repo read:user`)
- `GITHUB_OAUTH_STATE_SECRET` (recommended)
- `GITHUB_TOKEN_ENCRYPTION_KEY` (recommended)
- `GITHUB_WEBHOOK_SECRET` (required for legacy `POST /api/github/webhook` — manual repo webhooks)

GitHub App (Vercel-style: **one** webhook URL for every customer):

- `GITHUB_APP_ID` — App ID from GitHub App settings
- `GITHUB_APP_PRIVATE_KEY_PATH` — **recommended**: absolute or cwd-relative path to the `.pem` file GitHub gave you (e.g. `secrets/github-app.pem`). The `secrets/` folder is gitignored except `.gitkeep`; never commit PEM files.
- `GITHUB_APP_PRIVATE_KEY` — alternative to path: inline PEM (single `.env` line with `\n` escapes) or base64 of the full PEM file
- `GITHUB_APP_SLUG` — URL slug (`github.com/apps/<slug>`) for the “Install” link in the dashboard
- `GITHUB_APP_WEBHOOK_SECRET` — Webhook secret from the GitHub App (used for `POST /api/github/app/webhook`; falls back to `GITHUB_WEBHOOK_SECRET` if unset)

Register the app under GitHub → Settings → Developer settings → GitHub Apps:

1. **Webhook URL**: `{API_PUBLIC_URL}/github/app/webhook` when `API_PUBLIC_URL` already includes the `/api` prefix (e.g. `https://api.example.com/api`), or `{ORIGIN}/api/github/app/webhook` otherwise.
2. **Webhook events**: enable **Push**. Also enable **Installation** and **Installation repositories** when GitHub shows them — Routiq auto-stores installs on `installation` (`created`, …) and `installation_repositories` (`added`) by matching the installing GitHub user to someone who already used **Connect GitHub** (OAuth).
3. **Permissions**: Repository contents **Read-only** (clone); Metadata **Read** is usually granted by default.
4. **Setup URL** (optional but recommended): your frontend dashboard URL (e.g. `https://app.example.com/dashboard`). After install, GitHub redirects with `?installation_id=` so the client can call `POST /api/github/app/link-installation`.

URLs:

- `API_PUBLIC_URL` (used for GitHub callback fallback; include `/api` if your API lives under `/api`, see webhook examples above)
- `FRONTEND_URL` (used in redirects and emails)
- `NEXT_PUBLIC_APP_URL` (fallback for frontend URL)

AI:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; default `gpt-4o-mini`)

Email:

- `RESEND_API_KEY`
- `EMAIL_FROM` (optional)
- `EMAIL_REPLY_TO` (optional)

CLI auth:

- `JWT_CLI_EXPIRES_IN` (optional; default `365d`)

## Main API areas

- `POST /api/auth/*` - register, login, verify email, reset password, update profile
- `POST /api/auth/cli/device` and `POST /api/auth/cli/poll` - CLI browser login flow
- `POST /api/projects/sync` - sync scanned project into dashboard data
- `GET /api/projects/list` - list user projects/collections
- `POST /api/ai/enrich-endpoint` and `POST /api/ai/analyze-project` - AI enrichment endpoints
- `POST /api/github/scan` - enqueue GitHub scan job
- `GET /api/github/scan/jobs/:jobId` - poll GitHub scan job status
- `GET /api/github/subscriptions` - list auto-sync subscriptions
- `POST /api/github/subscriptions` - create/update an auto-sync subscription
- `DELETE /api/github/subscriptions/:id` - remove an auto-sync subscription
- `POST /api/github/webhook` - legacy per-repo push webhooks
- `POST /api/github/app/webhook` - GitHub App webhook (push + installation delete)
- `GET /api/github/app/status` - GitHub App configured / linked / install URL / webhook URL hints
- `POST /api/github/app/link-installation` - link Routiq user ↔ GitHub App `installation_id` (after OAuth connect)
- `GET /api/docs/:projectId` - published docs endpoints (via docs module controllers)

## Notes

- **`invalid_state` on GitHub connect:** Restart the API after changing `.env`, ensure **`JWT_SECRET`** (or **`GITHUB_OAUTH_STATE_SECRET`**) is stable, **`NEXT_PUBLIC_API_URL`** points at this backend, and the GitHub App/OAuth **Authorization callback URL** matches **`GITHUB_OAUTH_CALLBACK_URL`** (or `{API_PUBLIC_URL}/github/oauth/callback`) exactly.

- TypeORM is configured with `synchronize: true` in current code. Use caution in production and prefer migrations for long-term safety.
- GitHub scans run asynchronously through Redis/BullMQ and send completion/failure emails.
