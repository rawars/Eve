# Eve API

Cloudflare Worker responsible for authentication and cloud document persistence.

## Storage model

- D1 stores users, hashed sessions, file ownership, metadata, and the current revision pointer.
- R2 stores immutable JSON document revisions under `documents/{userId}/{fileId}/{revision}.json`.
- The browser keeps IndexedDB as the offline cache; cloud storage is authoritative after authentication.

## Local setup

From the repository root:

1. Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars`.
2. Copy `apps/web/.env.example` to `apps/web/.env.local`.
3. Run `pnpm --filter @eve/api db:migrate:local` once and whenever a new migration is added.
4. Run `pnpm dev:api` in one terminal.
5. Run `pnpm dev` in a second terminal.

The web app runs at `http://localhost:5173` and the Worker API at `http://localhost:8787`.

Wrangler uses local D1 and R2 simulations by default. Their state is persisted below `apps/api/.wrangler/state` and never modifies production unless a command explicitly uses `--remote`.

The example files use Cloudflare's official always-pass Turnstile test keys. They work on localhost and must never be used in production. Production uses the real widget site key and stores its secret with:

```sh
pnpm --filter @eve/api exec wrangler secret put TURNSTILE_SECRET_KEY
```

The production D1 database and R2 bucket are configured in `wrangler.jsonc`. Use `--local` for local database commands and `--remote` only when intentionally changing production.
