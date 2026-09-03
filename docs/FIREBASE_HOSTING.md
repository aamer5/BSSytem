# Firebase External Hosting

This project is configured for Firebase as an external host while preserving the existing Manus WebDev deployment. The supported full-stack arrangement is **Firebase Hosting for the compiled React frontend** and **Google Cloud Run for the Express/tRPC server**. Firebase Hosting cannot execute this project’s Node server by itself; the backend is required for Manus OAuth callbacks, protected tRPC procedures, database access, and S3-backed attachment operations. Firebase officially supports routing Hosting requests to Cloud Run services through Hosting rewrites [1].

## Architecture

| Layer | Firebase / Google Cloud resource | Responsibility |
|---|---|---|
| Browser UI | Firebase Hosting | Serves `dist/public`, HTTPS, CDN delivery, and SPA history fallback. |
| API and OAuth | Cloud Run service `board-secretariat-platform` | Runs `dist/index.js`, Express, tRPC, Manus OAuth callback, and server-side integrations. |
| Persistence | Existing MySQL/TiDB database | Stores workflow, access-control, audit, and attachment metadata. |
| File bytes | Existing S3-compatible storage | Stores uploaded documents; the database retains references and metadata only. |

The committed `firebase.json` routes `/api/**` to the Cloud Run service in `us-central1` and sends all other unmatched paths to `/index.html`. The API rewrite must appear before the SPA fallback because Firebase evaluates rewrite rules in order [2]. Change the service region in `firebase.json` if the Cloud Run service is deployed elsewhere.

## One-time Firebase and Google Cloud setup

Create or select a Firebase project and copy `.firebaserc.example` to `.firebaserc`, replacing `YOUR_FIREBASE_PROJECT_ID` with the real project ID. The Firebase project is also a Google Cloud project. Firebase Hosting setup requires a Firebase project, and Cloud Run source deployment requires the Cloud Run and Cloud Build APIs [1] [3].

Cloud Run requires a billing account. Associating billing with a Firebase project moves it from the Spark plan to Blaze, so review the current Firebase and Cloud Run pricing, quotas, and budget-alert options before enabling the backend [1]. This repository does not contain Firebase credentials or production secrets.

```bash
cp .firebaserc.example .firebaserc
# Edit .firebaserc and replace YOUR_FIREBASE_PROJECT_ID.

gcloud auth login
gcloud config set project YOUR_FIREBASE_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Install the Firebase CLI if it is not already available, then authenticate it against the same project:

```bash
npm install --global firebase-tools
firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
```

## Deploy the backend first

The existing build is compatible with Cloud Run source deployment. No Dockerfile is required: Cloud Run can use Google Cloud buildpacks when deploying directly from source [3]. The application already listens on the runtime-provided `PORT` value, and the production command is `node dist/index.js`.

Before deploying, configure the exact backend environment contract below in Cloud Run. Do not place these values in `firebase.json`, `.firebaserc`, source code, or GitHub. Prefer Secret Manager references for production credentials.

| Variable | Used by | Production source |
|---|---|---|
| `DATABASE_URL` | MySQL/TiDB connection | Secret Manager secret `DATABASE_URL`. |
| `JWT_SECRET` | Session cookie signing | Secret Manager secret `JWT_SECRET`. |
| `VITE_APP_ID` | Manus OAuth client/application ID | Secret Manager secret `VITE_APP_ID`; also passed as a build variable. |
| `OAUTH_SERVER_URL` | Server-side Manus OAuth API | Secret Manager secret `OAUTH_SERVER_URL`. |
| `OWNER_OPEN_ID` | Owner-aware authorization and administration | Secret Manager secret `OWNER_OPEN_ID`. |
| `BUILT_IN_FORGE_API_URL` | Server-side Manus built-in APIs, including storage support | Secret Manager secret `BUILT_IN_FORGE_API_URL`. |
| `BUILT_IN_FORGE_API_KEY` | Server-side Manus built-in API authorization | Secret Manager secret `BUILT_IN_FORGE_API_KEY`. |
| `NODE_ENV` | Production server behavior | Plain Cloud Run variable set to `production`. |
| `VITE_OAUTH_PORTAL_URL` | Browser login redirect initiation | Build-time variable; it is not a credential. |

`VITE_OAUTH_PORTAL_URL` and `VITE_APP_ID` are read by `client/src/const.ts` during the Vite build. The server-side list above matches the reads in `server/_core/env.ts` and `server/db.ts`. The project does not read a separate Firebase SDK configuration object in the browser because Firebase is used as the hosting origin rather than as the application database or authentication provider.

```bash
gcloud run deploy board-secretariat-platform \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-env-vars VITE_APP_ID=YOUR_MANUS_APP_ID \
  --set-env-vars OAUTH_SERVER_URL=https://api.manus.im \
  --set-env-vars VITE_OAUTH_PORTAL_URL=YOUR_MANUS_OAUTH_PORTAL_URL
```

The `--allow-unauthenticated` setting is needed so Firebase Hosting can reach the Cloud Run origin. This does **not** make protected business data public: protected tRPC procedures continue to enforce the Manus session and board-scoped permissions in the application. Keep the Cloud Run service URL available for health checks, but use the Firebase Hosting domain for browser traffic.

The checked-in `cloudrun/deploy.sh` uses `--set-secrets` for the exact runtime contract above and `--set-build-env-vars` for the browser build values. Before running it, create the named Secret Manager secrets and grant the Cloud Run service identity Secret Manager Secret Accessor. The database must accept connections from the Cloud Run deployment environment, and S3 storage configuration must remain server-side through the existing Manus built-in storage API configuration.

The repository command is:

```bash
export FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
export VITE_APP_ID=YOUR_MANUS_APP_ID
export VITE_OAUTH_PORTAL_URL=YOUR_MANUS_OAUTH_PORTAL_URL
pnpm run cloudrun:deploy
```

The script uses the default `us-central1` region and public invocation, and accepts `CLOUD_RUN_SERVICE` and `CLOUD_RUN_REGION` overrides. If a different region or a stricter deployment policy is required, edit the command after reviewing the Hosting rewrite target. The public Cloud Run origin is intentional for Firebase Hosting’s rewrite; application-level OAuth and board permission guards remain mandatory.

## Deploy Firebase Hosting

Build the frontend and deploy Hosting after the Cloud Run service exists:

```bash
pnpm run firebase:deploy
```

This runs the existing production build and then executes `firebase-tools deploy --only hosting`. The Hosting site is served from `dist/public`. Firebase Hosting provides HTTPS and project subdomains such as `PROJECT_ID.web.app` and `PROJECT_ID.firebaseapp.com` [4]. A custom domain can be attached later through the Firebase console.

The two deployment commands are intentionally separate. This makes it possible to roll back the frontend independently and prevents a Hosting deploy from being mistaken for a backend release.

## Manus OAuth configuration

After the Firebase domain is known, add the production callback URL to the Manus OAuth application configuration. The callback path used by this project is:

```text
https://YOUR_FIREBASE_HOSTING_DOMAIN/api/oauth/callback
```

Also confirm that the OAuth application accepts the Firebase origin as a permitted web origin and that the configured portal/client settings match the production environment. Test the full flow from the Firebase domain: click **Sign in**, complete Manus OAuth, return to `/api/oauth/callback`, and verify that the authenticated workspace loads.

The existing Manus WebDev domain remains a separate deployment target. Do not remove its OAuth redirect until the Firebase deployment has been verified and the old environment is intentionally retired.

## Validation checklist

| Check | Expected result |
|---|---|
| `pnpm run check` | TypeScript completes without errors. |
| `pnpm test` | Existing workflow and authorization tests pass. |
| `pnpm run firebase:build` | Vite and the server bundle produce `dist/public` and `dist/index.js`. |
| Firebase Hosting root | The Arabic-first shell loads and browser routes survive refresh. |
| `/api/trpc/auth.me` | The request reaches Cloud Run; unauthenticated state is handled by the UI. |
| OAuth callback | Manus redirects back to the Firebase domain and establishes the session. |
| Protected request API | Unauthenticated callers are rejected; authorized board members can use the workflow. |
| Attachment access | Signed storage references are issued only through protected server procedures. |
| Mobile RTL | Arabic remains RTL and English switching remains LTR on the deployed domain. |

## Important limitation

Firebase Hosting plus Cloud Run is an external deployment path, not a migration of the managed Manus database, OAuth service, or S3 service. The application can continue using those services only if their production network access, credentials, allowed origins, callback URLs, and terms support the external deployment. If the goal is to remove every Manus-managed dependency, that is a separate migration covering OAuth, database hosting, file storage, secrets, and operational monitoring.

## References

[1]: https://firebase.google.com/docs/hosting/cloud-run "Serve dynamic content and host microservices with Cloud Run — Firebase"

[2]: https://firebase.google.com/docs/hosting/full-config "Configure Hosting behavior — Firebase"

[3]: https://docs.cloud.google.com/run/docs/deploying-source-code "Deploy services from source code — Google Cloud Run"

[4]: https://firebase.google.com/docs/hosting/quickstart "Get started with Firebase Hosting — Firebase"
