# Motion Production Deployment Guide ($0 Free Tier)

This guide walks you through deploying the full **Motion** stack to production with **zero monthly cost ($0)**, without needing Docker or Kubernetes.

---

## 🏗️ Architecture Overview

```
   ┌───────────────────────┐
   │  Vercel (Frontend)    │  ◄── Global Edge CDN ($0)
   │  React 19 + Vite SPA  │
   └──────────┬────────────┘
              │ HTTPS API Calls
              ▼
   ┌───────────────────────┐
   │  Render (Backend)     │  ◄── Node.js Express + Prisma ($0)
   │  512MB RAM Web Service│
   └─────┬───────────┬─────┘
         │           │
         │           ▼
         │   ┌─────────────────────────────┐
         │   │ Google Gemini Cloud API     │  ◄── Free Tier (1,500 req/day)
         │   │ (Chat, ATS, Embeddings, Job)│      Replaces local Ollama in cloud!
         │   └─────────────────────────────┘
         ▼
   ┌─────────────────────────────┐
   │  Neon.tech (Database)       │  ◄── Serverless PostgreSQL ($0)
   │  pgvector + JSON storage    │
   └─────────────────────────────┘
```

---

## Step 1: Create Free PostgreSQL Database on Neon.tech (2 minutes)

1. Sign up / Log in to [Neon.tech](https://neon.tech) (free tier, no credit card required).
2. Click **Create Project**:
   - **Project Name**: `motion-db`
   - **Postgres Version**: 16 or 17 (default)
   - **Region**: Pick the region closest to you (e.g. `AWS us-east-2` or `eu-central-1`).
3. Once created, copy the **Connection Details** (choose **Node.js** or **Direct connection**):
   It will look like:
   ```
   postgresql://alex:AbCdEf12345@ep-cool-flower-a5xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. **Push your Prisma database schema to Neon from your terminal**:
   Open a terminal in `motion/` and run:
   ```bash
   # Temporarily set DATABASE_URL or put it in motion/.env
   npx prisma db push
   ```
   *Neon will automatically create all tables (`User`, `Conversation`, `Message`, `Resume`, `Document`, `DocumentChunk`, `KnowledgeChunk`) in seconds.*

---

## Step 2: Deploy Backend API on Render.com (3 minutes)

1. Sign up / Log in to [Render.com](https://render.com) using your GitHub account.
2. In the Render Dashboard, click **New +** → **Web Service**.
3. Choose **Build and deploy from a Git repository**, and select your repo:
   `https://github.com/Ayush001jaiswal/LLM`
4. Configure the service settings:
   - **Name**: `motion-backend`
   - **Root Directory**: `motion`  *(Important: specify `motion` since the repo is a monorepo!)*
   - **Environment**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` ($0.00/mo)
5. Under **Environment Variables**, add the following:
   | Key | Value | Notes |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Enables Gemini cloud routing |
   | `DATABASE_URL` | *Your Neon PostgreSQL connection string* | Must include `?sslmode=require` |
   | `JWT_SECRET` | *A secure random string (32+ chars)* | e.g. run `openssl rand -hex 32` |
   | `GEMINI_API_KEY` | *Your Gemini API key* | From Google AI Studio |
   | `GEMINI_MODEL` | `gemini-3.5-flash-lite` | $0 tier model |
   | `EMBED_PROVIDER` | `gemini` | Replaces Ollama embeddings |
   | `ADZUNA_APP_ID` | `a1a3d61a` | Live job search |
   | `ADZUNA_APP_KEY`| `1deea638a48dc0a0f6ec8ab44f28ad24` | Live job search |
   | `ADZUNA_COUNTRY`| `in` | Default job search country |
   | `FRONTEND_ORIGIN`| `*` *(or your Vercel URL once created)* | Allows frontend CORS |

6. Click **Deploy Web Service**.
   - Render will build your TypeScript code and launch the server.
   - Once healthy, copy your backend URL: e.g. `https://motion-backend-xyz.onrender.com`.
   - Test it: visit `https://motion-backend-xyz.onrender.com/api/health` → should return `{"status":"ok"}`.

---

## Step 3: Deploy Frontend UI on Vercel (2 minutes)

1. Sign up / Log in to [Vercel.com](https://vercel.com) using your GitHub account.
2. Click **Add New...** → **Project**.
3. Import your GitHub repository: `Ayush001jaiswal/LLM`.
4. Configure Project settings:
   - **Project Name**: `motion-ui`
   - **Framework Preset**: `Vite` (automatically detected)
   - **Root Directory**: Click *Edit* and select **`motion_ui`** *(Important!)*
   - **Build Command**: `npm run build` (auto detected)
   - **Output Directory**: `dist` (auto detected)
5. Expand **Environment Variables** and add:
   | Key | Value |
   | :--- | :--- |
   | `VITE_API_URL` | `https://motion-backend-xyz.onrender.com` *(your Render URL from Step 2)* |

6. Click **Deploy**.
   - Vercel will build the frontend in ~20 seconds and assign a free domain:
     `https://motion-ui-xyz.vercel.app`.

---

## Step 4: Final Link Check (1 minute)

1. Go back to Render Dashboard → `motion-backend` → **Environment Variables**.
2. Change `FRONTEND_ORIGIN` from `*` to your exact Vercel URL (e.g. `https://motion-ui-xyz.vercel.app`).
3. Click **Save Changes** (Render will reload the server with the strict CORS policy).

🎉 **Your entire application is now live on the internet, secure, production-grade, and 100% free!**
