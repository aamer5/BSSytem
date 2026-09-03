#!/usr/bin/env bash
set -euo pipefail

: "${FIREBASE_PROJECT_ID:?Set FIREBASE_PROJECT_ID to the Google/Firebase project ID}"
: "${VITE_APP_ID:?Set VITE_APP_ID to the Manus OAuth application ID}"
: "${VITE_OAUTH_PORTAL_URL:?Set VITE_OAUTH_PORTAL_URL to the Manus OAuth portal URL}"

SERVICE_NAME="${CLOUD_RUN_SERVICE:-board-secretariat-platform}"
REGION="${CLOUD_RUN_REGION:-us-central1}"

# Runtime secrets are resolved by Cloud Run from Secret Manager. Create each
# secret before running this script and grant the Cloud Run service identity
# Secret Manager Secret Accessor for them.
gcloud run deploy "$SERVICE_NAME" \
  --project "$FIREBASE_PROJECT_ID" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-build-env-vars "VITE_APP_ID=$VITE_APP_ID,VITE_OAUTH_PORTAL_URL=$VITE_OAUTH_PORTAL_URL" \
  --set-env-vars NODE_ENV=production \
  --set-secrets \
    DATABASE_URL=DATABASE_URL:latest,\
JWT_SECRET=JWT_SECRET:latest,\
VITE_APP_ID=VITE_APP_ID:latest,\
OAUTH_SERVER_URL=OAUTH_SERVER_URL:latest,\
OWNER_OPEN_ID=OWNER_OPEN_ID:latest,\
BUILT_IN_FORGE_API_URL=BUILT_IN_FORGE_API_URL:latest,\
BUILT_IN_FORGE_API_KEY=BUILT_IN_FORGE_API_KEY:latest
