# Implementation Plan — `name.jaenil.dev` Subdomain Routing

> **Status**: Implementation is ~95% complete. Core codebase and Cloudflare routing are done. Remaining tasks are putting real AWS keys in `.env`, starting the services, and testing end-to-end.

---

## 1. System Architecture & Decisions

| Decision | Choice | Status |
|---|---|---|
| Deployment URL format | `https://<projectName>.jaenil.dev` | ✅ Configured |
| Backend & Tunnel Host | **Mac Mini via Cloudflare Zero Trust Tunnel** | ✅ Wildcard route created |
| Object Storage | **AWS S3** (`amaz-s3-vercel` in `ap-south-1`) | ✅ Code updated |
| Frontend | React / Vite UI with inline error handling | ✅ Code updated |

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          THE FULL SYSTEM                                │
│                                                                         │
│  User's Browser          Cloudflare Edge         Your Mac Mini          │
│  ─────────────           ──────────────          ────────────           │
│                                                                         │
│  1. User visits           2. Cloudflare           3. cloudflared        │
│  myportfolio.             matches *.jaenil.dev     forwards traffic to  │
│  jaenil.dev  ────────►   wildcard tunnel  ──────► request-handler       │
│                           route                    on port 3001         │
│                                                         │               │
│                                                         │ 4. Extracts   │
│                                                         │ name from     │
│                                                         │ Host header   │
│                                                         │ ("myportfolio")
│                                                         │               │
│                                                         ▼               │
│                                                    5. Resolves in Redis:│
│                                                    name-to-id → id      │
│                                                    Fetches from S3:     │
│                                                    dist/{id}/index.html │
│                                                    (bucket: amaz-s3-vercel)
│                                                         │               │
│  ◄──────────────────────────────────────────────────────                │
│  6. Browser renders the deployed static site                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer-by-Layer Implementation Status

### Layer 1: Cloudflare Tunnel Routing
- [x] **Zero Trust Dashboard**: Route `*.jaenil.dev` -> `http://localhost:3001` added.
- [ ] **Mac Mini Daemon**: Ensure `cloudflared` service is running (`sudo systemctl restart cloudflared`).

---

### Layer 2: Environment Variables & AWS S3
- [x] S3 Bucket `amaz-s3-vercel` referenced across all services.
- [ ] **Action Required**: Add your real AWS credentials into the `.env` files:
  - `apps/upload-service/.env`
  - `apps/deploy-service/.env`
  - `apps/request-handler/.env`

```env
AWS_ACCESS_KEY_ID="your_real_access_key"
AWS_SECRET_ACCESS_KEY="your_real_secret_key"
AWS_REGION="ap-south-1"
BUCKET_NAME="amaz-s3-vercel"
```

---

### Layer 3: `upload-service`
- [x] **File**: [`upload-service/src/index.ts`](file:///Users/jaenilparekh/Documents/cs50/vercel/apps/upload-service/src/index.ts)
- [x] Reads `name` and `repoUrl` from `req.body`.
- [x] Validates `name` against `/^[a-z0-9-]{2,30}$/`.
- [x] Checks Redis `hGet("name-to-id", name)` and returns `409 Conflict` if taken.
- [x] Atomically reserves `hSet("name-to-id", name, id)` before cloning.
- [x] Pushes `id` to `build-queue` and sets `status` to `uploaded`.
- [x] Responds with `{ id, name }`.

---

### Layer 4: `deploy-service`
- [x] **File**: [`deploy-service/src/index.ts`](file:///Users/jaenilparekh/Documents/cs50/vercel/apps/deploy-service/src/index.ts)
- [x] Pops `id` from `build-queue`.
- [x] Downloads `output/{id}` from S3, executes `npm install && npm run build`.
- [x] Uploads built artifacts to `dist/{id}/` in S3.
- [x] Sets Redis `status` to `deployed`.

---

### Layer 5: `request-handler`
- [x] **File**: [`request-handler/src/index.ts`](file:///Users/jaenilparekh/Documents/cs50/vercel/apps/request-handler/src/index.ts)
- [x] Extracts `name` via `req.hostname.split(".")[0]`.
- [x] Looks up `id` via `redis.hGet("name-to-id", name)` (returns 404 if not found).
- [x] Serves file from S3 at `dist/${id}${filePath}`.
- [x] Full SPA support: falls back to `dist/${id}/index.html` on `NoSuchKey`.
- [x] Full MIME type handling (`.html`, `.css`, `.js`, `.png`, `.svg`, `.json`, `.woff2`, etc.).

---

### Layer 6: `frontend`
- [x] **File**: [`frontend/src/components/landing.tsx`](file:///Users/jaenilparekh/Documents/cs50/vercel/apps/frontend/src/components/landing.tsx)
- [x] Added **Project Name** input field.
- [x] Dispatches `name` and `repoUrl` in POST request to `/deploy`.
- [x] Inline error handling for 400 (invalid characters) and 409 (name taken).
- [x] Shows live deployment link as `https://${projectName}.jaenil.dev`.

---

## 3. How to Run and Test the Full System

### Step A: Start Infrastructure & Services
Open separate terminal tabs for each service:

1. **Redis**:
   ```bash
   redis-server
   ```

2. **Upload Service** (Port 3000):
   ```bash
   cd apps/upload-service && npm run dev
   ```

3. **Deploy Service** (Worker):
   ```bash
   cd apps/deploy-service && npm run dev
   ```

4. **Request Handler** (Port 3001):
   ```bash
   cd apps/request-handler && npm run dev
   ```

5. **Frontend UI** (Port 5173):
   ```bash
   cd apps/frontend && npm run dev
   ```

---

### Step B: Verification Checklist

1. **Test Duplicate Name Prevention**:
   - Go to `http://localhost:5173`.
   - Enter name `testapp` with a GitHub repo URL and deploy.
   - In another tab, try deploying another repo with the same name `testapp`.
   - Confirm it shows an inline error: `"testapp" is already taken. Please choose a different name.` (409).

2. **Test Build Pipeline**:
   - Wait for the build status to change from `uploading` → `uploaded` → `deployed`.
   - Verify files exist in S3 under `dist/<id>/`.

3. **Test Live Wildcard Deployment**:
   - Visit `https://testapp.jaenil.dev` in your browser.
   - Confirm that Cloudflare routes the request to your Mac Mini `request-handler` on port 3001, and the site renders properly over HTTPS!
