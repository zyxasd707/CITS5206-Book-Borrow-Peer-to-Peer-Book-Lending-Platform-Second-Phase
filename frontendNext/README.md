# BookBorrow 📚

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

---

## 🚀 Getting Started

### 1. Install dependencies

Make sure you have **Node.js (>=18)** installed.
We recommend using **npm**, but you can also use `yarn`, `pnpm`, or `bun`.

```bash
# install all dependencies
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

```bash
# and install extra libraries used in this project:
npm install zustand lucide-react tailwindcss postcss autoprefixer \
  @stripe/stripe-js @stripe/react-stripe-js
```

### 2. Environment variables
Create your frontend env file  **`.env.local`** (frontend root, same level as `package.json`):

```env
# Frontend (Next.js)
NEXT_PUBLIC_STRIPE_PK=pk_test_xxx        # Stripe publishable key (do NOT use secret key)
NEXT_PUBLIC_API_URL=http://localhost:8000  # backend API base URL
```

### 3. Run the development server
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Now open [http://localhost:3000](http://localhost:3000) in your browser.
The page auto-updates as you edit files in the `app/` directory (e.g. `app/page.tsx`).

---

Note: If a newly added route returns 404 during local development (Turbopack may not pick up new route files immediately), restart the frontend dev container:

```bash
docker compose -f compose.yaml -f compose.dev.yaml restart frontend
```


## 📦 Installed Packages

This project uses:

* **[Next.js](https://nextjs.org/)** – React framework for building web apps
* **[React](https://react.dev/)** – UI library
* **[TypeScript](https://www.typescriptlang.org/)** – static typing
* **[Tailwind CSS](https://tailwindcss.com/)** – utility-first CSS framework
* **[lucide-react](https://lucide.dev/)** – icons
* **[Zustand](https://github.com/pmndrs/zustand)** – lightweight global state management (used for Cart)
* **[shadcn/ui](https://ui.shadcn.com/)** – reusable UI components

If any package is missing, install them manually:

```bash
npm install zustand lucide-react tailwindcss postcss autoprefixer
```

For UI components (shadcn/ui):

```bash
npx shadcn-ui init
```

---

## 🛠 Development Notes

* Run `npm run lint` → check code style
* Run `npm run build` → build production version
* Run `npm run start` → start production server

---

## 📚 Learn More

* [Next.js Documentation](https://nextjs.org/docs) – features & API
* [Learn Next.js](https://nextjs.org/learn) – interactive tutorial
* [Next.js GitHub](https://github.com/vercel/next.js) – feedback & contributions

---

## ☁️ Deploy on Vercel

The easiest way to deploy your Next.js app is with [Vercel](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

See the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for details.
