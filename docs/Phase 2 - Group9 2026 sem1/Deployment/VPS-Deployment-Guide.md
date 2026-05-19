# VPS Deployment Guide

This document explains how the BookBorrow VPS deployment is structured, why it
is managed this way, and what a future handover team should check before and
after deploying changes.

The purpose of this guide is not only to list commands. It explains the logic
behind the deployment process so that the next team can safely maintain the VPS
without accidentally overwriting code, losing data, exposing secrets, or
breaking the production service.

## 1. Deployment Principle

The VPS is a deployment target, not the source of truth.

The source of truth for application code is the GitHub `main` branch. The VPS
should normally run the same commit as the latest approved `main` branch. Code
changes should be made locally, reviewed through pull requests, merged into
`main`, and then pulled onto the VPS.

This matters because manual code changes on the VPS are easy to lose. If a file
is edited directly on the server but the same change is not committed to GitHub,
the next `git pull` may create conflicts or overwrite the server-only fix.

Production data is different from code. Database records and uploaded media are
not stored in GitHub. They live in Docker volumes on the VPS and must be backed
up separately.

## 2. Current Production Source of Truth

- Repository: `https://github.com/zyxasd707/CITS5206-Book-Borrow-Peer-to-Peer-Book-Lending-Platform-Second-Phase.git`
- Deployment branch: `main`
- VPS application directory: `/root/capstone15/Bookborrow`
- Public URL: `https://www.bookborrow.org`
- Database container: `mysql-db`
- Database name: `BookBorrow`
- MySQL Docker volume: `bookborrow_mysql_data`
- Uploaded media Docker volume: `bookborrow_media`

Screenshot to capture:

- Local repository status showing the local `main` branch and commit:

![Local repository status](<screenshots/vps-deployment-guide/01-local-repo-status.png>)

- GitHub `main` branch showing the latest commit.

![GitHub main latest commit](<screenshots/vps-deployment-guide/02-github-main-commit.png>)

- VPS terminal output from:

```bash
cd /root/capstone15/Bookborrow
git rev-parse --short HEAD
```

![VPS commit matches GitHub main](<screenshots/vps-deployment-guide/03-vps-commit-match.png>)

The commit hash on the VPS should match the GitHub `main` commit after a
deployment.

## 3. Production Architecture

The VPS runs the application through Docker Compose. The production stack has
four main containers:

- `nginx-proxy`: public entry point for HTTP/HTTPS traffic.
- `next-frontend`: Next.js frontend application.
- `fastapi-backend`: FastAPI backend API.
- `mysql-db`: MySQL database.

The request flow is:

```text
User browser
  -> https://www.bookborrow.org
  -> nginx-proxy
  -> next-frontend or fastapi-backend
  -> mysql-db
```

The database is not intended to be used directly by public traffic. It is used
by the backend over the Docker network.

Screenshot to capture:

```bash
cd /root/capstone15/Bookborrow
docker compose -f compose.yaml ps
```

![Docker Compose production containers](<screenshots/vps-deployment-guide/04-docker-compose-ps.png>)

Expected services:

- `nginx-proxy` is `Up`.
- `next-frontend` is `Up`.
- `fastapi-backend` is `Up`.
- `mysql-db` is `Up`.

## 4. Important Files and Directories

Key files:

- `compose.yaml`: production Docker Compose configuration.
- `.env`: production environment variables and secrets. This file must not be
  committed to GitHub.
- `nginx/nginx.conf`: production nginx reverse proxy configuration.
- `docs/Phase 1/production-runbook.md`: command-focused production runbook.
- `scripts/vps/backup_db.sh`: database backup helper.
- `scripts/vps/backup_media.sh`: media backup helper.
- `scripts/vps/rollback.sh`: rollback helper.
- `scripts/vps/check_health.sh`: health check helper.

Key persistent data:

- `bookborrow_mysql_data`: stores MySQL data.
- `bookborrow_media`: stores uploaded book cover images and other media files.

Do not delete these volumes unless a deliberate full data reset has been
approved.

## 5. Environment Variables and Secrets

The VPS requires a real `.env` file in the application directory:

```bash
/root/capstone15/Bookborrow/.env
```

This file contains deployment-specific settings such as:

- database credentials
- JWT secret
- Stripe keys
- Brevo email key
- AusPost API key
- frontend/backend public URLs
- CORS origins

The repository includes `.env.example` as a template only. It does not contain
real secrets. Future teams should use the GitHub version as the reference for
required environment variable names:

```text
https://github.com/zyxasd707/CITS5206-Book-Borrow-Peer-to-Peer-Book-Lending-Platform-Second-Phase/blob/main/.env.example
```

Why this matters:

- `.env` is required for the containers to run correctly.
- `.env` contains sensitive values and must not be committed.
- If payment, email, or shipping integrations point to the wrong account, the
  application can appear to work but send payments, email, or API calls to the
  wrong service account.

Do not include screenshots of the real VPS `.env` file. If environment
variables need to be discussed in a handover, link to `.env.example` in GitHub
and provide the real values through the team's approved private credential
handover channel.

## 6. Standard Deployment Workflow

Use this workflow when a pull request has been reviewed, merged into `main`, and
the VPS needs to run the latest approved commit.

```bash
ssh -i <private-key-path> <vps-user>@<vps-host>
sudo su -
cd /root/capstone15/Bookborrow

git status --short
git fetch origin main
git pull --ff-only origin main
git rev-parse --short HEAD
```

The SSH command should use the private key and VPS account provided during the
handover. Do not record passwords, private key passphrases, or full credential
values in screenshots or shared documentation.

Why each step is needed:

- The SSH step enters the remote VPS environment where the production Docker
  stack is running.
- `git status --short` checks whether the VPS has local changes. Unexpected
  modified files should be investigated before deployment.
- `git fetch origin main` updates the VPS knowledge of the remote branch.
- `git pull --ff-only origin main` only allows a clean fast-forward deployment.
  It avoids creating merge commits on the VPS.
- `git rev-parse --short HEAD` confirms exactly which commit the VPS is now
  running from.

Screenshot to capture:

- Terminal output showing `git pull --ff-only origin main`.
- Terminal output showing the final commit hash.

## 7. When to Rebuild Containers

Pulling code and rebuilding containers are not the same thing.

`git pull` updates files on the VPS filesystem. Docker containers, however,
usually run code that was copied into an image during the last build. If runtime
code changes but the container is not rebuilt, the old application may still be
running.

Use this rule:

- Documentation-only changes do not require rebuild.
- Backend code changes require rebuilding `backend`.
- Frontend code changes require rebuilding `frontend`.
- Compose, Dockerfile, dependency, or environment-related changes usually
  require rebuilding the affected services, or the full stack.

For a full production rebuild:

```bash
cd /root/capstone15/Bookborrow
docker compose -f compose.yaml up -d --build
```

For a backend-only rebuild:

```bash
cd /root/capstone15/Bookborrow
docker compose -f compose.yaml up -d --build backend
```

For a frontend-only rebuild:

```bash
cd /root/capstone15/Bookborrow
docker compose -f compose.yaml up -d --build frontend
```

Screenshot to capture:

- `git diff --name-only <old-commit>..<new-commit>` showing what changed.
- Docker build output showing the rebuilt service.
- `docker compose -f compose.yaml ps` after rebuild.

## 8. Production Smoke Checks

After deployment, confirm that the service is actually running.

```bash
cd /root/capstone15/Bookborrow
docker compose -f compose.yaml ps
docker compose -f compose.yaml logs --tail=120 backend
curl -k -I https://www.bookborrow.org
curl -k -i https://www.bookborrow.org/api/v1/books
curl -i http://127.0.0.1:8000/health
```

Expected results:

- All containers are `Up`.
- The frontend URL returns a successful response.
- The API returns JSON.
- Backend logs show successful startup.
- The health endpoint returns a healthy status if enabled.

Screenshot to capture:

- Browser loading `https://www.bookborrow.org`.

![Public homepage](<screenshots/vps-deployment-guide/05-public-homepage.png>)

- Public API smoke check for `https://www.bookborrow.org/api/v1/books`.

![Public API smoke check](<screenshots/vps-deployment-guide/06-public-api-books.png>)

- `docker compose -f compose.yaml ps`.
- Backend startup logs.

Note: FastAPI exposes Swagger at `/docs` inside the backend application, but
the production nginx configuration only proxies public backend traffic under
`/api/` and `/media/`. Therefore `https://www.bookborrow.org/docs` is not used
as the public production API screenshot unless nginx is explicitly changed to
expose it.

## 9. Functional Checks After Larger Changes

For deployment involving backend, payment, email, media, or checkout logic,
perform functional checks in addition to container checks.

Recommended checks:

- User can register and log in.
- Email verification code can be received.
- Book listing and book detail pages load.
- Uploaded book covers display correctly.
- Borrower can complete a Stripe test checkout.
- Lender receives the expected Stripe transfer after shipment confirmation.
- Deposit refund/damage compensation flow behaves as expected.
- Admin platform service fee setting is reflected in checkout totals.

Screenshot to capture:

- Homepage after deployment.
- A book detail page with a visible cover image.
- Checkout total showing platform service fee.
- Stripe test dashboard transaction or transfer record.

![Stripe sandbox transaction and transfer records](<screenshots/vps-deployment-guide/10-stripe-test-transfer.png>)

- Admin setting page if the deployment changed fee settings.

## 10. Database and Media Volumes

The database and uploaded files are persistent data. They are not restored by
pulling GitHub code.

Important volumes:

```bash
docker volume ls | grep bookborrow
```

Expected volumes:

- `bookborrow_mysql_data`
- `bookborrow_media`

Do not run this command during normal deployment:

```bash
docker compose -f compose.yaml down -v
```

Why this is dangerous:

- `down` stops and removes containers.
- `-v` also removes named volumes.
- Removing volumes can delete the production database and uploaded media.

Use normal rebuild commands instead:

```bash
docker compose -f compose.yaml up -d --build
```

## 11. Uploaded Media Handling

Uploaded book covers and media files are stored in the named Docker volume:

```text
bookborrow_media
```

This was introduced to avoid losing uploaded files when the backend container is
rebuilt. Without a persistent media volume, uploaded covers may disappear after
container recreation because the files only existed inside the old container
filesystem.

If cover images are missing after deployment, check:

- whether `bookborrow_media` is mounted into the backend container
- whether nginx serves `/media/...` correctly
- whether the file path stored in the database matches the file in the media
  volume

Screenshot to capture:

- A book page showing a cover image after deployment.
- `docker volume ls | grep bookborrow_media`.

![Book list with uploaded cover images](<screenshots/vps-deployment-guide/07-book-cover-media.png>)

In the screenshot above, books with uploaded cover images render their covers
normally. Grey placeholders indicate books where the lender did not upload a
cover image; those placeholders are expected and do not indicate a media volume
failure.

![BookBorrow Docker volumes](<screenshots/vps-deployment-guide/08-docker-volumes.png>)

The current production deployment depends on `bookborrow_media` for uploaded
files and `bookborrow_mysql_data` for MySQL data. Older or legacy volumes may
also appear on the VPS, but they should not be treated as the active production
source unless the Compose configuration explicitly references them.

## 12. Backup Procedure

Backups protect production data from accidental data loss, failed migrations,
or incorrect deployment operations.

Database backup:

```bash
cd /root/capstone15/Bookborrow
bash scripts/vps/backup_db.sh
```

Media backup:

```bash
cd /root/capstone15/Bookborrow
bash scripts/vps/backup_media.sh
```

Default backup directories:

```text
/root/capstone15/backups/bookborrow-db
/root/capstone15/backups/bookborrow-media
```

Screenshot to capture:

```bash
ls -lh /root/capstone15/backups/bookborrow-db
ls -lh /root/capstone15/backups/bookborrow-media
```

![Database and media backup directories](<screenshots/vps-deployment-guide/09-backup-directory.png>)

The VPS repository also includes helper scripts for backup, restore, health
checking, media migration, and rollback:

![VPS helper scripts](<screenshots/vps-deployment-guide/11-vps-scripts.png>)

Do not commit backup files to GitHub.

## 13. Rollback Procedure

Rollback is used when the latest deployed commit causes a production issue.

Code rollback:

```bash
cd /root/capstone15/Bookborrow
bash scripts/vps/rollback.sh <git-ref>
```

Example:

```bash
bash scripts/vps/rollback.sh 9454b8f
```

Important limitation:

Rolling back code does not automatically roll back database data. If a failed
deployment changed the database schema or production records, restoring a
database backup may also be required.

Before rollback, record:

- current commit
- target rollback commit
- reason for rollback
- whether database restore is required

Screenshot to capture:

- GitHub commit history showing the known good commit.
- Terminal output after rollback showing the new `HEAD`.

## 14. Common Deployment Situations

### Documentation-only update

Use:

```bash
git pull --ff-only origin main
```

No rebuild is required because running containers are unaffected.

### Backend code update

Use:

```bash
git pull --ff-only origin main
docker compose -f compose.yaml up -d --build backend
docker compose -f compose.yaml logs --tail=120 backend
```

### Frontend code update

Use:

```bash
git pull --ff-only origin main
docker compose -f compose.yaml up -d --build frontend
curl -k -I https://www.bookborrow.org
```

### Full stack update

Use:

```bash
git pull --ff-only origin main
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps
```

### Unexpected local changes on VPS

If `git status --short` shows modified tracked files, do not immediately pull.

First inspect:

```bash
git diff
```

If the change is intentional and should remain, commit it through the normal
GitHub PR process before deploying. If it is a temporary hotfix that has already
been merged into `main`, compare it with `origin/main` before restoring.

Untracked nginx certificate directories are expected:

```text
nginx/certbot/
nginx/letsencrypt/
```

These contain VPS-specific TLS files and should not be committed.

## 15. Handover Checklist

Before handing the VPS to the next team, confirm:

- GitHub `main` contains all production code changes.
- VPS `HEAD` matches GitHub `main`.
- `.env` exists on VPS and points to the correct service accounts.
- Docker containers are running.
- Database and media volumes exist.
- Backup scripts are available.
- Recent database backup exists.
- Book covers still load after deployment.
- Stripe test payment and transfer flow have been checked.
- Email verification flow has been checked.
- The next team knows not to use `docker compose down -v` unless intentionally
  resetting data.

Useful commands:

```bash
cd /root/capstone15/Bookborrow
git rev-parse --short HEAD
git status --short
docker compose -f compose.yaml ps
docker volume ls | grep bookborrow
```

## 16. Screenshot Evidence Summary

This guide includes the following evidence screenshots:

1. Local, GitHub, and VPS commit alignment.
2. Production Docker containers running.
3. Public homepage and API smoke checks.
4. Uploaded cover images and media volume verification.
5. Database and media Docker volumes.
6. Database/media backup directories and VPS helper scripts.
7. Stripe sandbox payment, refund, charge, and transfer records.
8. GitHub link to `.env.example` for required environment variable names.

Do not include screenshots that reveal real API keys, passwords, JWT secrets, or
private Stripe keys.
