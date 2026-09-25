#!/usr/bin/env bash
set -euo pipefail

: "${FIREBASE_PROJECT_ID:?Set FIREBASE_PROJECT_ID to the Google/Firebase project ID}"
: "${VITE_FIREBASE_API_KEY:?Set VITE_FIREBASE_API_KEY from Firebase console > Project settings > Your apps}"
: "${VITE_FIREBASE_APP_ID:?Set VITE_FIREBASE_APP_ID from Firebase console > Project settings > Your apps}"
: "${ADMIN_EMAILS:?Set ADMIN_EMAILS to a comma-separated list of administrator emails}"

SERVICE_NAME="${CLOUD_RUN_SERVICE:-board-secretariat-platform}"
# Same region as the Firestore database (Dammam) to keep reads and writes local.
REGION="${CLOUD_RUN_REGION:-me-central2}"
AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN:-$FIREBASE_PROJECT_ID.firebaseapp.com}"

# Firestore and Firebase Auth use the Cloud Run service identity (Application
# Default Credentials); grant it roles/datastore.user on the project. The "^;^"
# prefix makes ";" the env-var separator so ADMIN_EMAILS may contain commas. Storage
# secrets are resolved by Cloud Run from Secret Manager; create them first and
# grant the service identity Secret Manager Secret Accessor.
gcloud run deploy "$SERVICE_NAME" \
  --project "$FIREBASE_PROJECT_ID" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-build-env-vars "VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY,VITE_FIREBASE_AUTH_DOMAIN=$AUTH_DOMAIN,VITE_FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID,VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID" \
  --set-env-vars "^;^NODE_ENV=production;FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID;ADMIN_EMAILS=$ADMIN_EMAILS" \
  --set-secrets \
    BUILT_IN_FORGE_API_URL=BUILT_IN_FORGE_API_URL:latest,\
BUILT_IN_FORGE_API_KEY=BUILT_IN_FORGE_API_KEY:latest
