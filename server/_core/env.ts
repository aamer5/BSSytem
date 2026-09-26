export const ENV = {
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? "",
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT ?? "",
  // Comma-separated emails that are promoted to the global admin role once
  // their Firebase account has a verified email address.
  adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean),
  // Browser origins allowed to call the API when the website and the API are
  // served from different domains (e.g. Firebase Hosting + Render).
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "https://bssytem-27ee8.web.app,https://bssytem-27ee8.firebaseapp.com").split(",").map(origin => origin.trim().replace(/\/+$/, "")).filter(Boolean),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
