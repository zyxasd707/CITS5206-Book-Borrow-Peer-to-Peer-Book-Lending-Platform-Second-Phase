# Production Verification Runbook

This runbook covers the BookBorrow VPS deployment after the Phase 2
BookHive-to-BookBorrow migration.

## Source of Truth

- Repository: `https://github.com/zyxasd707/CITS5206-Book-Borrow-Peer-to-Peer-Book-Lending-Platform-Second-Phase.git`
- Deployment branch: `main`
- VPS app directory: `/root/capstone15/Bookborrow`
- Public URL: `https://www.bookborrow.org`
- Database: Docker MySQL container `mysql-db`, database `BookBorrow`
- Database volume: `bookborrow_mysql_data`
- Uploaded media volume: `bookborrow_media`

## Standard Deployment

```bash
cd /root/capstone15/Bookborrow
git fetch origin
git pull --ff-only origin main
# Run this once before the first deployment that introduces bookborrow_media.
bash scripts/vps/migrate_media_volume.sh
docker compose -f compose.yaml build
docker compose -f compose.yaml up -d
docker compose -f compose.yaml exec backend alembic -c alembic.ini upgrade head
docker compose -f compose.yaml ps
```

Run migrations after the containers are healthy and before accepting traffic
for schema-dependent changes.
After the media volume has been introduced once, `migrate_media_volume.sh`
does not need to be part of every standard deployment.

## Production Smoke Checks

```bash
curl -k -I https://www.bookborrow.org
curl -k -i https://www.bookborrow.org/api/v1/books
curl -i http://127.0.0.1:8000/health
docker compose -f compose.yaml ps
docker logs --tail=120 fastapi-backend
```

Expected results:

- Frontend returns `200`.
- `/api/v1/books` returns `200` with JSON.
- Backend `/health` returns `{"status":"healthy"}`.
- `mysql-db`, `fastapi-backend`, `next-frontend`, and `nginx-proxy` are running.

## Email Flow Check

1. Open `https://www.bookborrow.org/register`.
2. Request an email verification code using a controlled test address.
3. Confirm the email arrives from the configured Brevo sender.
4. Check backend logs if delivery fails:

```bash
docker logs --tail=200 fastapi-backend
```

## Payment Flow Check

Use Stripe test keys only in non-production payment tests.

1. Register or log in as a borrower.
2. Add a listed book to cart.
3. Complete checkout with a Stripe test card.
4. Verify the order appears under borrowing/lending views.
5. Verify payment/refund records through admin refund pages if applicable.

## Monitoring Checks

Run the baseline check script:

```bash
cd /root/capstone15/Bookborrow
bash scripts/vps/check_health.sh
```

The script checks:

- container presence and restart counts
- backend health
- public frontend/API routes
- disk usage
- TLS certificate expiry

Schedule it with cron or an external monitor and alert on non-zero exit.

Example cron entry:

```cron
*/15 * * * * cd /root/capstone15/Bookborrow && bash scripts/vps/check_health.sh >> /var/log/bookborrow-health.log 2>&1
```

## Backups

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

Recommended daily cron:

```cron
15 18 * * * cd /root/capstone15/Bookborrow && bash scripts/vps/backup_db.sh >> /var/log/bookborrow-backup.log 2>&1
25 18 * * * cd /root/capstone15/Bookborrow && bash scripts/vps/backup_media.sh >> /var/log/bookborrow-media-backup.log 2>&1
```

The default backup directory is:

```text
/root/capstone15/backups/bookborrow-db
/root/capstone15/backups/bookborrow-media
```

## Media Volume Migration

Uploaded files are stored under `/app/media` and served through `/media/...`.
Before the first deployment that introduces the `bookborrow_media` Docker
volume, copy the current container media files into the named volume:

```bash
cd /root/capstone15/Bookborrow
bash scripts/vps/migrate_media_volume.sh
docker compose -f compose.yaml up -d backend nginx
curl -k -I https://www.bookborrow.org/media/<known-upload-path>
```

## Restore Drill

Use a non-production database or a temporary VPS snapshot when possible.

```bash
cd /root/capstone15/Bookborrow
bash scripts/vps/restore_db.sh /root/capstone15/backups/bookborrow-db/<backup-file>.sql.gz
docker compose -f compose.yaml restart backend
curl -k -i https://www.bookborrow.org/api/v1/books
```

Record the date, backup file, operator, and outcome in the team handover notes.

## Rollback

Rollback to a known good Git ref:

```bash
cd /root/capstone15/Bookborrow
bash scripts/vps/rollback.sh <git-ref>
```

If the rollback also requires data rollback, restore a database backup before
reopening the service to users.

## Do Not Commit

- `.env`
- `nginx/letsencrypt/`
- `nginx/certbot/`
- database backup files
