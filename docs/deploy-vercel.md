# Deploying Campus Market to Vercel

Campus Market runs as **three Vercel projects** from the same GitHub repository, with
**Supabase** holding the database and photos:

| Part | Where | Folder |
| --- | --- | --- |
| Website (React/Vite) | Vercel project 1 | `frontend/` |
| API (Express) | Vercel project 2, as a serverless function | `backend/` |
| AI recommendations (Python/Flask) | Vercel project 3, as a serverless function (optional, see step 6) | `ai-service/` |
| Database and photos | Supabase (Postgres + Storage) | — |

The API and AI functions run in Vercel's Singapore region (`"regions": ["sin1"]` in their
`vercel.json`), next to a Supabase project in ap-southeast-1. If your Supabase project is in
another region, change `sin1` to the Vercel region closest to it.

Vercel deploys the repository's production branch (`main` by default) every time it changes.

## Before you start

- The code is on GitHub (`LeLoydyy/Campusmarket`) on the branch Vercel will deploy.
- You can sign in to Vercel and to your Supabase project.
- Never paste keys or passwords into chat, issues or code. They go only into the Vercel
  dashboard's **Environment Variables**.

## 1. Collect three values from Supabase

In the Supabase dashboard for your project:

1. **DATABASE_URL**: click **Connect** → **Connection string** → **Transaction pooler**
   (port `6543`). Copy the URI and put your database password into it.
   The transaction pooler suits serverless functions, which open many short connections.
2. **SUPABASE_URL**: **Project Settings → API** → Project URL, like `https://abcd1234.supabase.co`.
3. **SUPABASE_SECRET_KEY**: **Project Settings → API Keys** → a *secret* key (`sb_secret_…`),
   or the legacy `service_role` key. Keep this private. It can do anything in the project.

You don't need to create tables or the photo bucket. The API creates them
(`backend/database/schema.sql`) the first time it connects.

## 2. Create the API project (backend)

1. In Vercel: **Add New… → Project** → import `Campusmarket`.
2. **Root Directory:** `backend`. **Framework Preset:** Other. Leave the build settings empty.
   `backend/vercel.json` sends every request to the Express app.
3. Add these **Environment Variables** (Production):

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Transaction pooler URI from step 1 |
| `DATABASE_POOL_SIZE` | `1` (each serverless instance keeps one connection) |
| `PHOTO_STORAGE` | `supabase` |
| `SUPABASE_URL` | From step 1 |
| `SUPABASE_SECRET_KEY` | From step 1 |
| `JWT_SECRET` | A long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `FRONTEND_URL` | Leave as `https://example.com` for now. You'll set it in step 4. |
| `BOOTSTRAP_ADMIN_EMAIL` | The email the first administrator signs in with |
| `BOOTSTRAP_ADMIN_PASSWORD` | A strong temporary password. Change it after signing in. |
| `EMAIL_PROVIDER` | `smtp` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Same values as your working local `backend/.env` |
| `PREMIUM_PRICE`, `PREMIUM_PAYMENT_INFO` | Optional: copy from local `.env` if you set them |

Don't set `PORT`, `SEED_DEMO`, `SEED_PASSWORD`, `SKIP_EMAIL_OTP` or `PGLITE_DIR`.
With `NODE_ENV=production` the demo accounts are never created, the sign-up email code
is always required, and the API refuses to run if `JWT_SECRET` is shorter than 32 characters.

4. **Deploy**. Then open `https://<api-project>.vercel.app/api/health`. It should show
   `{"status":"ok",...}`. Copy this project's address; you need it next.

## 3. Create the website project (frontend)

1. **Add New… → Project** → import `Campusmarket` again.
2. **Root Directory:** `frontend`. **Framework Preset:** Vite (detected automatically).
3. Environment Variable:

| Name | Value |
| --- | --- |
| `VITE_API_URL` | `https://<api-project>.vercel.app/api` (the address from step 2, ending in `/api`) |

4. **Deploy**. Copy the website's address, like `https://campusmarket.vercel.app`.

`VITE_API_URL` is built into the website. If you change it later, redeploy the website.

## 4. Connect the two

1. In the **API project** → Settings → Environment Variables, set `FRONTEND_URL` to the website
   address from step 3, with no trailing slash. To allow a custom domain too, separate the
   addresses with commas: `https://campusmarket.vercel.app,https://market.csucc.edu.ph`.
2. **Redeploy** the API project: Deployments → ⋯ → Redeploy.

## 5. First sign-in and clean-up

1. Open the website and sign in with `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`.
2. Change that password (Change password page).
3. Remove `BOOTSTRAP_ADMIN_PASSWORD` (and the email) from the API project's variables and
   redeploy. Leaving the password there would let anyone who sees the dashboard use it.
4. Smoke test: register a test buyer (the email code arrives over SMTP), apply for a stall,
   upload a product photo (it should load from `…supabase.co/storage/…`), place an order
   and send a message.

## 6. AI recommendation service (optional)

Without it, "Recommended for you" and "Similar products" use simple rules (most viewed,
same category). With it, they come from the recommender in `ai-service/`: user-based
collaborative filtering on views, carts, favorites and purchases, and content-based
similarity on category and price.

1. Make one shared secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. **Create New → Project → Campusmarket → Import single project** next to **ai-service** (Flask).
   Project Name `campusmarket-ai`, Root Directory `ai-service`.
3. Environment Variables:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | The same transaction pooler URI as the API |
| `AI_SERVICE_SECRET` | The secret from step 1 |

4. **Deploy**, then open `https://<ai-project>.vercel.app/health`. It should show `{"status":"ok"}`.
   Every other address answers `401 Unauthorised` unless the secret is sent, which is expected.
5. In the **API project**, add these and redeploy:

| Name | Value |
| --- | --- |
| `AI_SERVICE_URL` | `https://<ai-project>.vercel.app` (no trailing slash) |
| `AI_SERVICE_SECRET` | The same secret from step 1 |
| `AI_TIMEOUT_MS` | `8000` (gives a cold-started Python function time to answer) |

If the AI service is slow or down, the API falls back to the simple rules after `AI_TIMEOUT_MS`,
so the site keeps working either way.

## How the API behaves on Vercel

- **No long-running server.** `backend/api/index.js` hands each request to the Express app.
  The database connects on the first request after a cold start, and the schema is applied then.
- **Premium expiry.** Locally a timer checks every 10 minutes. On Vercel, incoming requests
  start the check, at most once every 10 minutes per running instance.
- **Photos.** Uploads are limited to 4 MB, because Vercel rejects request bodies over 4.5 MB.
  Photos go to the Supabase Storage bucket `product-images`.
- **Rate limits.** Counted per running instance, so they're looser than on a single server.
  Each visitor still gets their own limit (Vercel's proxy is trusted for the visitor's address).

## Your local data isn't copied

Production starts with an empty database. The products, accounts and photos on your
computer (`backend/.data/pglite`, `backend/uploads/products`) stay local. Sellers and
admins set up the real stalls and listings on the live site.

## Plans and limits to know

- **Vercel Hobby** is free but for non-commercial use. A capstone pilot fits. A paid
  marketplace for the school may need Vercel Pro.
- **Supabase Free** pauses a project after a week without activity, and has a 500 MB database.
  Open the site regularly during the pilot, or upgrade.
- The **AI service** uses numpy and pandas only (no scikit-learn), which keeps the Python
  function well under Vercel's size limit.
