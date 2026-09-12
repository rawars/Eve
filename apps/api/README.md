# Eve API

Cloudflare Worker responsible for authentication and cloud document persistence.

## Storage model

- D1 stores users, hashed sessions, file ownership, metadata, and the current revision pointer.
- R2 stores immutable JSON document revisions under `documents/{userId}/{fileId}/{revision}.json`.
- The browser keeps IndexedDB as the offline cache; cloud storage is authoritative after authentication.

## Local setup

1. Copy `.dev.vars.example` to `.dev.vars`.
2. Run `pnpm --filter @eve/api db:migrate:local`.
3. Run `pnpm dev:api`.

Turnstile is disabled locally. In production, create a widget, set `TURNSTILE_ENABLED=true`, and store its secret with:

```sh
pnpm --filter @eve/api exec wrangler secret put TURNSTILE_SECRET_KEY
```

Before deploying, create the D1 database and R2 bucket, then replace the D1 database ID in `wrangler.jsonc`.
