# CLAUDE.md — Project guidance for AI assistants working in this repo

This file captures non-obvious project conventions and recurring pitfalls so future AI assistants (and teammates) don't re-discover them.

## Stack at a glance

- **Frontend:** Next.js (app router) + TypeScript + Tailwind + Shadcn UI → [frontendNext/](frontendNext/)
- **Backend:** FastAPI + SQLAlchemy (ORM) + PyMySQL → [fastapi/](fastapi/)
- **DB:** MySQL 8, reached inside the Docker network as host `db:3306`, exposed on host `:3307`
- **Gateway:** nginx on `:80` proxies `/` to Next and `/api/v1/*` to FastAPI
- **Dev stack:** `compose.yaml` + `compose.dev.yaml` (no HTTPS, no block rules)

Payments via Stripe (test keys in `.env`). Email via Brevo (placeholder is fine locally).

## Starting and stopping (local dev, Windows/macOS)

```bash
# First time / after schema changes: clean slate
docker compose -f compose.yaml -f compose.dev.yaml down -v
docker compose -f compose.yaml -f compose.dev.yaml up -d --build

# Daily: no -v needed
docker compose -f compose.yaml -f compose.dev.yaml up -d

# Stop (keep data)
docker compose -f compose.yaml -f compose.dev.yaml down

# Stop + wipe data
docker compose -f compose.yaml -f compose.dev.yaml down -v
```

Access via **http://localhost/** (nginx), **not** `:3000`. API docs at http://localhost:8000/docs.

## ⚠️ Schema migrations — the single biggest gotcha

**The project does not use Alembic.** Tables are created at startup by `Base.metadata.create_all()` in [fastapi/main.py](fastapi/main.py). That function:

- ✅ Creates tables that don't exist yet
- ❌ Does **not** add new columns to tables that already exist
- ❌ Does **not** alter FKs, indexes, or column types

**Implication:** any time a branch adds columns to an existing table, every teammate's local MySQL volume must be wiped once with `down -v` before the backend will start. Otherwise they get:

```
pymysql.err.OperationalError: (1054, "Unknown column '<something>' in 'field list'")
ERROR:    Application startup failed. Exiting.
```

The resulting backend crash cascades into a 502 Bad Gateway from nginx for every API call.

### When `down -v` is required

- After pulling a branch that adds/renames DB columns
- After that branch merges to `main` and teammates pull main
- Whenever a teammate reports `Unknown column '…' in 'field list'` or startup failure

### When `down -v` is NOT required

- Daily `git pull` that only touches frontend code or service logic
- Code-only rebuilds: `docker compose … up -d --build`

### If you really need to keep local data

Write explicit `ALTER TABLE` statements for every new column and FK change, then restart without `-v`. Current PRs that shipped schema changes document their ALTER statements in the PR body (see PR #64 for MVP6-1 reference).

## Test accounts (seeded automatically on a fresh DB)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@bookhive.com` | `Admin123!` |
| Lender | `bob@example.com` | `Password123!` |
| Borrower | `carol@example.com` | `Password123!` |

Seed data comes from [fastapi/seed.py](fastapi/seed.py). It runs automatically on first boot when `users` + `book` are empty, plus `_seed_deposit_demos()` runs idempotently (even when DB is not empty) to keep one `pending_review` deposit demo present.

To force re-seed inside the container:
```bash
docker exec -it fastapi-backend python seed.py --force
```

## Feature-specific notes

### MVP6 Refund / MVP6-1 Deposit Management (PR #57, #62, #64 — merged)

- `is_admin` is on `/user/me`. Admin pages should check `Boolean(user.is_admin)` from this endpoint. Don't fall back to email matching in new code.
- Restricted users (`is_restricted=true`) are blocked from **borrow** checkouts only — purchases still go through. See [fastapi/routes/order.py::create_order](fastapi/routes/order.py).
- Deposit arbitration issues partial Stripe refunds via direct `stripe.Refund.create(amount=…)` in [fastapi/services/deposit_service.py](fastapi/services/deposit_service.py), bypassing `payment_gateway_service.refund_payment()` which only supports full-category refunds.
- `deposit_audit_log.order_id` is **nullable** with `ON DELETE SET NULL` (user-level actions like restrict/unrestrict have no order). If you encounter an older DB with `NOT NULL` + `CASCADE`, it needs the ALTER documented in PR #64.

## Harmless warnings to ignore

```
WARN[…] compose.yaml: the attribute `version` is obsolete, it will be ignored
WARN[…] compose.dev.yaml: the attribute `version` is obsolete
```

Unrelated to any bug. Clean-up is removing the `version:` line at the top of each compose file — a separate chore, not a blocker.

## Commit / PR conventions

- Commit style: conventional commits (`feat(scope): …`, `fix(scope): …`, `refactor(scope): …`, `docs(scope): …`)
- **Do not add `Co-Authored-By: Claude …`** or any AI attribution in commits or PR bodies.
- PRs that touch DB schema must document the migration path in the PR body (either `ALTER TABLE` statements or a `down -v` note) so reviewers don't silently get the 1054 error.

## When stuck, read logs first

```bash
docker ps                                                    # all four containers Up?
docker compose -f compose.yaml -f compose.dev.yaml logs backend --tail 80
docker compose -f compose.yaml -f compose.dev.yaml logs nginx  --tail 20
```

A 502 from the frontend almost always means `backend` exited. `docker ps` will show it as `Exited` or `Restarting`, and the backend log tail will have the Python traceback.
