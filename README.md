# BookBorrow - Peer-to-Peer Book Lending Platform

BookBorrow is a community-driven web platform that enables secure and accountable book sharing and borrowing. Users can register, list books, borrow or purchase books, and complete transactions with platform-supported protection mechanisms such as deposits, reviews, and dispute workflows.

---

## Product Reference

Product Requirement Document (PRD):  
<https://skfusc.axshare.com/?g=4>

---

## Core Features

### User Management
- User registration and authentication
- Profile management (bio, location, history, ratings)
- User review and reputation system
- Personal blacklist and platform-wide moderation controls
- Misuse reporting and complaint handling workflow

### Book Listing and Borrowing
- Book listing creation, update, and removal
- Borrow request lifecycle (request, payment, shipping, return)
- Real-time status updates and overdue handling
- Delivery options: pickup and platform shipping
- Platform-managed deposit lifecycle:
  - Deposit collection
  - Deposit release
  - Deposit deduction for damage/loss
- Scheduled automation for order state transitions

### Purchase and Delivery
- Direct book purchase from owner to borrower
- Payment processing with platform fee handling
- Shipping workflow integration and status tracking
- Refund processing support

### Payment and Settlement
- Deposit hold, release, and compensation operations
- Borrowing and purchase service fee management
- Settlement and financial distribution tracking
- Audit-friendly transaction logs
- Optional donation support

### Messaging and Notifications
- Real-time user messaging linked to orders
- In-app and email notifications
- Event alerts for request, shipping, return, and dispute changes
- Communication history for dispute review

### Dispute Management
- Dispute ticket submission
- Administrative review and intervention
- Evidence upload support (images, chat excerpts, records)
- Partial/full deposit deduction decisions
- Automated settlement updates and ledger consistency

### Platform Administration
- Service fee configuration
- Global blacklist management
- Dispute resolution operations
- Platform rule governance
- Payment and transaction audit support
- Scheduled operational tasks

---

## Tech Stack

**Frontend**
- [Next.js](https://nextjs.org/)
- TypeScript
- Tailwind CSS / Shadcn UI

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/)
- SQLModel (ORM)
- MySQL

**Supporting Tools**
- GitHub (version control and collaboration)
- Axure RP (PRD and prototype)
- Stripe (payments)
- Brevo (email notifications)

---

## Project Timeline

Key milestones:
- Project setup completed (requirements, PRD, architecture)
- Authentication baseline completed
- Borrowing workflow MVP completed
- Payment integration completed
- Stabilization, documentation, and demonstration completed

Detailed timeline: [Gantt Chart](docs/gantt.png)

---

## Repository Structure

```text
BookBorrow/
├── frontendNext/   # Next.js frontend
├── fastapi/        # FastAPI backend
├── docs/           # Project docs, requirements, notes, diagrams
└── README.md       # Project overview and runbook
```

---

## Setup and Installation

### 1) Clone Repository

```bash
git clone https://github.com/ChienAnTu/BookBorrow.git
cd BookBorrow
cp .env.example .env
```

Update values in `.env` before running services.

Environment guidance:
- Use `.env.example` as the starting template for any new environment.
- Keep local development values on `localhost`.
- Use `https://www.bookborrow.org` for VPS / production-facing values such as `APP_BASE_URL`, `FRONTEND_URL`, and `NEXT_PUBLIC_API_URL`.

### 2) Frontend (Local Non-Docker Option)

```bash
cd frontendNext
npm install
npm run dev
```

Frontend URL: <http://localhost:3000>

### 3) Backend (Local Non-Docker Option)

```bash
cd fastapi
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend URL: <http://localhost:8000>

---

## Deployment Guide

### Production (VPS)

```bash
make up
```

- Uses `compose.yaml` with `compose.prod.yaml`
- HTTPS enabled (TLS via Certbot)
- Security block rules enabled
- Public endpoint: `https://bookborrow.org`

### Development (Docker Local)

```bash
make up-dev
```

- Uses `compose.yaml` with `compose.dev.yaml`
- No TLS and no production block rules
- Local endpoint: `http://localhost`

---

## Local Docker Setup (Without `make`)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

### Step 1 - Configure `.env`

```powershell
cp .env.example .env
```

Minimum local configuration:

```env
DB_USER=<database-user>
DB_PASSWORD=<database-password>
DB_HOST=db
DB_PORT=3306
DB_NAME=BookBorrow

SECRET_KEY=<any-random-string-32-chars-or-more>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Placeholder values for local startup. Replace with real credentials only in private .env files.
BREVO_API_KEY=<brevo-api-key>
BREVO_KEY_TYPE=<brevo-key-type>
BREVO_SENDER_EMAIL=<verified-sender-email>
BREVO_SENDER_NAME=<sender-display-name>
STRIPE_SECRET_KEY=<stripe-secret-key>

# Required to avoid CORS issues in local dev
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost,http://127.0.0.1
```

Production note:
- The VPS should use a private `.env` with production-only secrets and public URLs set to `https://www.bookborrow.org`.
- Do not copy the production `.env` back into local development unless you intentionally want local services to target production endpoints.

### Step 2 - Start Docker Desktop

Wait until Docker is fully initialized.

### Step 3 - First-Time Build and Run

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

### Step 4 - Verify Startup

Startup is healthy when logs include:

```text
fastapi-backend  | INFO:     Application startup complete.
next-frontend    | Ready in ...ms
```

### Step 5 - Seed Data (Optional)

In local Docker mode, backend startup auto-seeds sample users/books only when both `users` and `book` tables are empty.

Manual seed inside backend container:

```powershell
docker exec -it fastapi-backend python seed.py
```

Force reseed:

```powershell
docker exec -it fastapi-backend python seed.py --force
```

Verification endpoints:
- `http://localhost:8000/api/v1/books`
- `http://localhost/books`

Important notes:
- Auto-seeding runs only when both tables are empty.
- Do not run `python fastapi/seed.py` from host unless host Python dependencies and DB access are configured.
- Default local Docker uses `DB_HOST=db`; manual seed commands should run in `fastapi-backend`.

### Step 6 - Access Services

- Frontend: `http://localhost`
- Backend docs: `http://localhost:8000/docs`

### Daily Startup

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up
```

### Stop Services

```powershell
# Stop services and keep DB data
docker compose -f compose.yaml -f compose.dev.yaml down

# Stop services and remove DB data
docker compose -f compose.yaml -f compose.dev.yaml down -v
```

---

## Troubleshooting

| Error | Cause | Resolution |
|-------|-------|------------|
| `open //./pipe/dockerDesktopLinuxEngine` | Docker Desktop not running | Start Docker Desktop and wait until ready |
| `Conflict. The container name already in use` | Stale containers | Run `docker compose ... down`, then retry |
| `ports are not available: 3306` | Local MySQL conflict | Local mapping is `3307:3306`; free conflicting ports if needed |
| `Missing BREVO_API_KEY` | `.env` missing required values | Update `.env` with Brevo keys |
| `BREVO_SENDER_EMAIL is not configured` | Sender not configured | Set `BREVO_SENDER_EMAIL` and configure a verified Brevo sender |
| `CORS policy blocked` | Missing localhost origins | Add localhost entries to `ALLOWED_ORIGINS` |
| `localhost:3000 refused` | Host port mismatch | Use `http://localhost` for nginx entrypoint |

Full reset (last resort):

```powershell
docker compose -f compose.yaml -f compose.dev.yaml down -v
docker rm -f fastapi-backend next-frontend nginx-proxy mysql-db
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

---

## Prerequisites

- Docker and Docker Compose
- `make` (optional, for shortcut commands)

### Install `make`

#### macOS
```bash
brew install make
```

#### Windows
1. Install [Chocolatey](https://chocolatey.org/install)
2. Install `make`:
   ```powershell
   choco install make
   ```
3. Restart terminal and verify:
   ```powershell
   make --version
   ```

---

## Documentation and Resources

- [Draft Requirements](docs/requirements.md)
- [Axure Prototype](https://chienantu.github.io/BookBorrow/prototype/)
- Meeting notes in `docs/`

---

## Collaboration and Roles

- Product management: requirements, PRD, and stakeholder communication
- Frontend engineering: Next.js implementation and UX delivery
- Backend engineering: API, database, and business logic
- Documentation and QA: reports, diagrams, and testing

---

## Operational Notes

- `.env` is not committed; each environment maintains its own secure version.
- TLS certificates (`nginx/letsencrypt/`) and VPS runtime artifacts must not be pushed.
- Local development does not require HTTPS.
- Do not push code from production servers. Production changes must flow through GitHub-based workflows to preserve traceability and deployment consistency.
- Production verification, monitoring, backup, restore, and rollback steps are documented in [docs/production-runbook.md](docs/production-runbook.md).
- Database schema changes are tracked by Alembic migrations under `fastapi/migrations/`.

---

## Useful Commands

### Production

```bash
make up
make down
make build
make logs
make migrate
make health
make backup-db
```

### Development

```bash
make up-dev
make down-dev
make build-dev
make logs-dev
make migrate-dev
```

### Cleanup

```bash
make clean
```

---

## License

This project is developed for academic capstone purposes.  
All rights are reserved by the project contributors.
