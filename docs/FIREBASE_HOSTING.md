# Firebase Deployment (Hosting, Auth, Firestore)

The website, sign-in and database run on Firebase's free **Spark** plan. The API server runs on **Render** (free plan) because Cloud Run needs the Blaze plan, and Google Cloud billing for Saudi addresses goes through the CNTXT reseller. Cloud Run remains documented below as an alternative.

| Layer | Resource | Responsibility |
|---|---|---|
| Browser UI | Firebase Hosting | Serves `dist/public` (React SPA) over HTTPS/CDN with SPA history fallback. |
| Sign-in | Firebase Authentication (Email/Password) | Registration, sign-in, email verification and password reset in the browser. |
| API | Render web service `board-secretariat-api` (`render.yaml`) | Runs `dist/index.js` (Express + tRPC). Verifies Firebase ID tokens and enforces board permissions and workflow rules. The website calls it cross-origin (`VITE_API_URL`), allowed by `ALLOWED_ORIGINS`. |
| Persistence | Cloud Firestore (Native mode, `me-central2` Dammam) | Boards, memberships, requests, checklists, history, snapshots, attachment metadata. |
| File bytes | Existing Forge/S3 storage | Unchanged; Firestore keeps metadata only. |

The browser never reads or writes Firestore directly. All data access goes through the tRPC API using the Firebase Admin SDK, and `firestore.rules` denies every client request.

## How authentication works

1. The browser signs in with the Firebase JS SDK (`client/src/lib/firebase.ts`, `client/src/components/AuthScreen.tsx`).
2. New accounts receive a verification email. Until the address is verified the app shows the "Verify your email" screen and the API treats the caller as signed out.
3. Every tRPC request sends `Authorization: Bearer <Firebase ID token>`. `server/_core/auth.ts` verifies it with the Admin SDK and resolves the application user:
   - an existing user linked to the Firebase UID, otherwise
   - a user migrated from MySQL with the same verified email (linked on first sign-in, keeping its id, memberships and history), otherwise
   - a new user with the `user` role.
4. Emails listed in `ADMIN_EMAILS` are promoted to the global `admin` role once verified. Admins can grant or revoke the role from **Administration**.

## One-time Firebase setup

In the [Firebase console](https://console.firebase.google.com/) for project `bssytem-27ee8`:

1. **Authentication → Sign-in method** → enable **Email/Password**.
2. **Authentication → Settings → Authorized domains** → make sure the Hosting domain(s) and any custom domain are listed.
3. **Firestore Database** → create a database in **Native mode**. This project uses `me-central2` (Dammam); Cloud Run is deployed to the same region.
4. **Project settings → Your apps** → add a **Web app** and copy `apiKey` and `appId`. These are public identifiers, not secrets.
5. Optional: **Authentication → Templates** to customise the verification / password-reset emails (Arabic and English are sent according to the UI language).

Deploy the locked-down Firestore rules:

```bash
npx firebase-tools login
pnpm run firebase:deploy:rules
```

No composite indexes are required; every query uses equality filters only.

## Environment contract

| Variable | Where | Purpose |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Server | Firebase project (`bssytem-27ee8`). |
| `FIREBASE_SERVICE_ACCOUNT` | Server | Service-account JSON. Required on Render; optional on Cloud Run (uses the service identity). |
| `ALLOWED_ORIGINS` | Server | Website origins allowed to call the API. Defaults to the two Firebase Hosting domains. |
| `ADMIN_EMAILS` | Server | Comma-separated administrator emails. |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Server (secret) | File storage, unchanged. |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID` | Build time | Firebase web app config. |
| `VITE_API_URL` | Build time | Public URL of the API server when it isn't on the website's domain (the Render URL). |
| `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` | Build time | Defaults to `bssytem-27ee8.firebaseapp.com` / `bssytem-27ee8`. |

`.env.example` lists every variable for local development. The old `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` and `OWNER_OPEN_ID` settings are no longer used.

For GitHub Actions, add `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID` as repository **variables** (Settings → Secrets and variables → Actions → Variables); `.github/workflows/firebase-deploy.yml` passes them to the build.

## Deploy the API server (Render, recommended)

1. **Service account key.** Firebase console → ⚙️ **Project settings** → **Service accounts** → **Generate new private key**. A JSON file downloads. Treat it like a password: never commit it or paste it into chats or issues.
2. **Create the service.** Sign in at [render.com](https://render.com) with GitHub → **New** → **Blueprint** → choose `aamer5/BSSytem`. Render reads `render.yaml` and proposes the `board-secretariat-api` web service (Frankfurt, free plan).
3. **Fill in the secret values** Render asks for:
   - `FIREBASE_SERVICE_ACCOUNT`: open the downloaded JSON file and paste its entire contents.
   - `ADMIN_EMAILS`: comma-separated administrator emails.
   - `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`: the existing file-storage values (attachments need them).
4. Click **Apply**. When the deploy finishes, open `https://<your-service>.onrender.com/api/health`; it should show `{"ok":true}`.
5. **Point the website at the API.** GitHub → repo **Settings** → **Secrets and variables** → **Actions** → **Variables** → add `VITE_API_URL` = the Render URL (for example `https://board-secretariat-api.onrender.com`, no trailing slash). Re-run the "Deploy to Firebase Hosting" workflow or push to `main`.

Render redeploys the API automatically on every push to `main`. The free plan sleeps after a period of inactivity, so the first request afterwards can take up to about a minute; a paid instance stays awake. If you add a custom domain for the website, add it to `ALLOWED_ORIGINS` in Render.

## Deploy the API on Cloud Run (alternative, needs Blaze)

```bash
gcloud auth login
gcloud config set project bssytem-27ee8
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com

# Allow the Cloud Run runtime service account to use Firestore.
gcloud projects add-iam-policy-binding bssytem-27ee8 \
  --member "serviceAccount:$(gcloud projects describe bssytem-27ee8 --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
  --role roles/datastore.user

export FIREBASE_PROJECT_ID=bssytem-27ee8
export VITE_FIREBASE_API_KEY=...        # from the web app config
export VITE_FIREBASE_APP_ID=...         # from the web app config
export ADMIN_EMAILS=you@example.com
pnpm run cloudrun:deploy
```

With Cloud Run you can either set `VITE_API_URL` to the Cloud Run URL (same as Render) or route `/api/**` through Hosting with a rewrite before the SPA fallback in `firebase.json`:

```json
{ "source": "/api/**", "run": { "serviceId": "board-secretariat-platform", "region": "me-central2" } }
```

Firebase Hosting only supports Cloud Run rewrites in some regions; if it rejects `me-central2`, use `VITE_API_URL` instead.

## Deploy Hosting

```bash
pnpm run firebase:deploy
```

Pushes to `main` also deploy Hosting through GitHub Actions, using the `VITE_FIREBASE_*` and `VITE_API_URL` repository variables.

## Migrating existing MySQL data

Run once, after Firestore is created and before users start working in the new deployment:

```bash
export LEGACY_DATABASE_URL='mysql://user:password@host:3306/database'
export FIREBASE_PROJECT_ID=bssytem-27ee8
gcloud auth application-default login   # or set FIREBASE_SERVICE_ACCOUNT

pnpm migrate:firestore --dry-run        # prints row counts per table, writes nothing
pnpm migrate:firestore                  # copies every table into Firestore
```

- Every row becomes a document whose ID is its old numeric id, so references between records keep working. Id counters are raised past the largest migrated id.
- The script refuses to run if a target collection already has documents. `--overwrite` replaces documents that share an id.
- Users are migrated without a Firebase login. Each person registers (or uses **Forgot password?**) with the **same email address** they had before. After verifying it, they are linked to their old account, keeping their role and board memberships.

## Local development with emulators

```bash
npx firebase-tools emulators:start --only auth,firestore --project demo-bssytem
# In another terminal, with the emulator variables from .env.example set:
pnpm dev
```

`pnpm test` runs the unit tests. `pnpm test:emulator` also runs `server/firestore.emulator.test.ts` (auth, account linking, the request workflow, access scoping and id allocation) against the emulators. It needs Java 11+.

## Validation checklist

| Check | Expected result |
|---|---|
| `pnpm check` | TypeScript completes without errors. |
| `pnpm test:emulator` | Unit and Firestore/Auth integration tests pass. |
| `pnpm build` | Produces `dist/public` and `dist/index.js`. |
| Register | Verification email arrives; the app unlocks after the link is opened and **Continue** is pressed. |
| `ADMIN_EMAILS` user | Sees **Administration** after verifying. |
| Migrated user | Registers with the old email and sees their previous boards and requests. |
| Mobile RTL | Arabic stays RTL and English switches to LTR on the deployed domain. |
