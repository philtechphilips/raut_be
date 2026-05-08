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

- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `GITHUB_OAUTH_CALLBACK_URL` (optional; fallback uses `API_PUBLIC_URL`)
- `GITHUB_OAUTH_SCOPES` (optional; default `repo read:user`)
- `GITHUB_OAUTH_STATE_SECRET` (recommended)
- `GITHUB_TOKEN_ENCRYPTION_KEY` (recommended)

URLs:

- `API_PUBLIC_URL` (used for GitHub callback fallback)
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
- `GET /api/docs/:projectId` - published docs endpoints (via docs module controllers)

## Notes

- TypeORM is configured with `synchronize: true` in current code. Use caution in production and prefer migrations for long-term safety.
- GitHub scans run asynchronously through Redis/BullMQ and send completion/failure emails.
