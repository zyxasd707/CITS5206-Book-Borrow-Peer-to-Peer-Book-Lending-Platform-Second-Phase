# BookBorrow – Peer-to-Peer Book Lending Platform

BookBorrow is a **community-driven web platform** that allows users to share books in a secure and trustworthy way.
Users can register, list books for lending, borrow books from others, and complete transactions with accountability ensured through **deposits, reviews, and platform rules**.

---

## Features
Product Requirement Document (PRD) can be found here:
https://skfusc.axshare.com/?g=4


### 👤 User Management

- User registration & login
- Profile management (bio, location, borrowing history, ratings)
- User reviews & rating system
- Blacklist system (users can block each other)
- Platform-maintained global blacklist
- Misuse reporting & moderation workflow

------

### 📖 Book Listing & Borrowing Workflow

- List books for lending (title, author, photos, description, condition)
- Edit / delete book listings
- Borrow request workflow (request → pay → shipping → return)
- Real-time borrowing status updates
- Automatic overdue handling
- Dual options: self-pickup or platform shipping
- Platform-managed deposit mechanism
  - Platform receives deposit
  - Platform refunds deposit
  - Deposit deduction for losses/damages
- Order status automation (scheduled backend tasks)

------

### 🛒 Purchase & Delivery

- Users may purchase books directly from the owner
- Platform handles payment & fee deduction
- Platform-managed shipping workflow
- Shipping status tracking
- Platform-issued refunds

------

### 🧾 Payment & Settlement System

- Deposit management (hold, refund, compensation)
- Platform fee management (borrowing / purchase fee)
- Dispute settlement & fee distribution
- Transparent transaction logs
- Refund tracking
- Optional donation support

------

### 💬 Messaging, Notifications & Real-time Features

- Real-time chat between users (linked to each order)
- System notifications (email + in-app)
- Status change alerts: request updates, shipping, returns, disputes
- Dispute communication & mediation logs

------

### ⚖️ Dispute Management 

- Dispute ticket creation
- Customer support involvement (Admin)
- Evidence upload (photos, chat logs, transaction records)
- Partial or full deposit deduction (Admin)
- Automated settlement & platform ledger updates

------

### 🔧 Platform Management (Admin)

- Configure service fee rate
- Manage global blacklist
- Handle user disputes
- Modify platform-level rules
- Transaction & payment audit trail
- Automated tasks (overdue updates, settlement updates)
---

## Tech Stack

**Frontend**

* [Next.js](https://nextjs.org/) (React framework)
* TypeScript
* TailwindCSS / Shadcn UI

**Backend**

* [FastAPI](https://fastapi.tiangolo.com/)
* SQLModel (ORM)
* MySQL (Database)

**Other Tools**

* GitHub for version control
* Axure RP for PRD & prototype design
* Stripe (payment integration)

---

## Project Timeline

Key milestones include:

* ✅ Project Ready – Requirements, PRD, and tech stack finalized
* 🔄 Core Authentication Ready – Registration & login
* 📖 Book & Loan Workflow MVP – Borrow-return cycle functional
* 💳 Payment Gateway Integrated – Deposits & transactions live
* 🚢 Final Delivery – Stable platform, documentation, and demo

*(see [Gantt Chart](docs/gantt.png) for detailed timeline)*

---

## 📂 Repository Structure

```
Bookhive/
├── frontendNext/         # Next.js frontend
├── fastapi/          # FastAPI backend (TBD)
├── docs/             # Project documentation, PRD, meeting notes, diagrams
└── README.md         # Project overview
```

---

## 📦 Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/ChienAnTu/Bookhive.git
cd Bookhive
cp .env.example .env
```
Then update detail in .env file

### 2. Frontend Setup

```bash
cd frontendNext
npm install
npm run dev
```

Runs the Next.js frontend on [http://localhost:3000](http://localhost:3000)

### 3. Backend Setup (FastAPI)

Open a new terminal window, navigate to the frontend directory, and start the frontend:

```bash
cd fastapi
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Runs backend API at [http://localhost:8000](http://localhost:8000)

---

## 📖 Documentation & Resources

* 📑 [Draft Requirements](docs/requirements.md)
* 🖥️ [Axure Prototype](https://chienantu.github.io/Bookhive/prototype/)
* 📝 Meeting Notes (in `/docs`)

---

## 👥 Team & Roles

* Product Manager – Requirement gathering, PRD, client communications
* Frontend Developers – Next.js implementation
* Backend Developers – FastAPI, DB, API integration
* Documentation & QA – SRS, UML, testing support

---

# 📚 Bookhive Deployment Guide

## 🚀 How to Start

### Production (VPS)
```bash
make up
```
- Deploys using `compose.yaml` + `compose.prod.yaml`
- Runs with HTTPS (TLS via Certbot) and security block rules enabled
- Accessible at: `https://bookborrow.org`

### Development (Local)
```bash
make up-dev
```
- Deploys using `compose.yaml` + `compose.dev.yaml`
- No TLS, no block rules (simplified for local testing)
- Accessible at: `http://localhost`

---

## 🖥️ Local Development Setup (Windows / Without `make`)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git installed

### Step 1 — Configure `.env`

Copy the example file and fill in the values:

```powershell
cp .env.example .env
```

Minimum required values for local development:

```env
DB_USER=myuser
DB_PASSWORD=123456
DB_HOST=db
DB_PORT=3306
DB_NAME=BookHive

SECRET_KEY=<any-random-string-32-chars-or-more>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Placeholder values — email/payment won't work locally, but the app will start
BREVO_API_KEY=xkeysib-local-dev-placeholder-key-not-real
BREVO_KEY_TYPE=api-key
BREVO_SENDER_EMAIL=no-reply@example.com
BREVO_SENDER_NAME=BookHive
STRIPE_SECRET_KEY=sk_test_local_dev_placeholder_not_real

# Must include http://localhost to avoid CORS errors
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost,http://127.0.0.1
```

### Step 2 — Start Docker Desktop

Open Docker Desktop and wait until the icon in the system tray is stable (not spinning). This takes ~1–2 minutes.

### Step 3 — Build and start (first time only)

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

### Step 4 — Wait for startup

Startup is complete when you see both lines:

### Step 5 — Seed sample data

In the default local Docker setup, the backend now auto-seeds sample users and books on startup if both the `users` and `book` tables are empty.

That means after:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up
```

you normally do not need a second terminal just to seed data.

If you want to re-seed manually from inside the backend container:

```powershell
docker exec -it fastapi-backend python seed.py
```

To force a manual re-seed:

```powershell
docker exec -it fastapi-backend python seed.py --force
```

To verify the sample books were inserted, open:

- `http://localhost:8000/api/v1/books`
- `http://localhost/books`

Important:

- Auto-seeding only happens when both the `users` and `book` tables are empty.
- Do not run `python fastapi/seed.py` directly from the host unless your local Python environment has the backend dependencies installed and your database host is reachable from the host machine.
- In the default local Docker setup, `.env` uses `DB_HOST=db`, which works inside the Docker network and is why manual seed commands should be run in `fastapi-backend`.

```
fastapi-backend  | INFO:     Application startup complete.
next-frontend    |  ✓ Ready in ...ms
```

### Step 5 — Open in browser

| URL | Purpose |
|-----|---------|
| `http://localhost` | Frontend (main entry point) |
| `http://localhost:8000/docs` | Backend API docs |

---

### Daily startup (after first time)

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up
```

### Stop the project

```powershell
# Stop but keep database data
docker compose -f compose.yaml -f compose.dev.yaml down

# Stop and delete database data (full reset)
docker compose -f compose.yaml -f compose.dev.yaml down -v
```

---

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `open //./pipe/dockerDesktopLinuxEngine` | Docker Desktop not running | Start Docker Desktop and wait for it to be ready |
| `Conflict. The container name already in use` | Stale containers from previous run | Run `docker compose ... down` then retry |
| `ports are not available: 3306` | Local MySQL occupying port 3306 | Already handled — config uses `3307:3306` |
| `Missing BREVO_API_KEY` | `.env` not configured | Follow Step 1 above |
| `BREVO_SENDER_EMAIL is not configured` | Verification email sender is missing | Add `BREVO_SENDER_EMAIL` and a verified sender in Brevo |
| `CORS policy blocked` | `ALLOWED_ORIGINS` missing `http://localhost` | Add `http://localhost` to `ALLOWED_ORIGINS` in `.env` |
| `localhost:3000 refused` | Port 3000 not exposed to host | Access `http://localhost` (no port number) |

**Full reset (when nothing else works):**

```powershell
docker compose -f compose.yaml -f compose.dev.yaml down -v
docker rm -f fastapi-backend next-frontend nginx-proxy mysql-db
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

---

## 🛠 Prerequisites

- **Docker & Docker Compose** (required in all environments)  
- **make** (for simplified commands)

### Installing `make`

#### macOS
```bash
brew install make
```
(macOS may already include `make`; check with `make --version`.)

#### Windows
1. Install [Chocolatey](https://chocolatey.org/install)  
   - Open PowerShell as Administrator  
   - Run:  
     ```powershell
     Set-ExecutionPolicy Bypass -Scope Process -Force; `
     [System.Net.ServicePointManager]::SecurityProtocol = `
     [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; `
     iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
     ```

2. Install make:  
   ```powershell
   choco install make
   ```

3. Restart the terminal and confirm:  
   ```powershell
   make --version
   ```

---

## 📝 Notes
- The `.env` file is **not committed** – each environment must create and maintain its own.
- Certificates (`nginx/letsencrypt/`) and logs are **VPS-only** and must never be pushed to GitHub.
- Development does not require HTTPS (use `http://localhost`).
- ⚠️ **PLEASE DO NOT PUSH ANY CODES FROM THE PRODUCTION SERVER**  
  Production is managed **only via GitHub Actions**.  
  Manual edits or commits made directly on the VPS will break deployment consistency.

---

## 🔧 Useful Commands

### Production
```bash
make up        # start containers in production mode
make down      # stop containers
make build     # rebuild containers
make logs      # follow logs (nginx, frontend, backend)
```

### Development
```bash
make up-dev    # start containers in development mode
make down-dev  # stop containers
make build-dev # rebuild containers
make logs-dev  # follow logs (nginx, frontend, backend)
```

### Clean-up
```bash
make clean     # prune unused Docker images, networks, volumes
```

## 🔒 License

This project is for academic purposes (University Capstone Project).
All rights reserved to the project contributors. 
