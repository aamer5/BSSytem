import type { Request } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import type { User } from "@shared/schema";
import { allocateIds, col, COLLECTIONS, docRef, getDb, getFirebaseAuth } from "../firestore";
import { ENV } from "./env";

// Maps Firebase Auth UIDs to numeric user ids. Reading this document inside a
// transaction serialises concurrent first sign-ins for the same account.
const AUTH_LINKS = "user_auth_links";
const LAST_SIGNED_IN_RESOLUTION_MS = 15 * 60 * 1000;

type StoredUser = Omit<User, "createdAt" | "updatedAt" | "lastSignedIn"> & { createdAt: Timestamp; updatedAt: Timestamp; lastSignedIn: Timestamp };

export function toUser(data: StoredUser): User {
  return { ...data, createdAt: data.createdAt.toDate(), updatedAt: data.updatedAt.toDate(), lastSignedIn: data.lastSignedIn.toDate() };
}

function bearerToken(req: Request) {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

const isAdminEmail = (token: DecodedIdToken) => Boolean(token.email_verified && token.email && ENV.adminEmails.includes(token.email.toLowerCase()));

// Returns the signed-in user for a request carrying a Firebase ID token, or null.
// Accounts whose email address is not yet verified are treated as signed out.
export async function authenticateRequest(req: Request): Promise<User | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const decoded = await getFirebaseAuth().verifyIdToken(token);
  if (!decoded.email_verified) return null;
  return resolveUser(decoded);
}

export async function resolveUser(token: DecodedIdToken): Promise<User> {
  const db = getDb();
  const email = token.email?.toLowerCase() ?? null;
  const loginMethod = token.firebase?.sign_in_provider ?? "password";
  const linkRef = db.collection(AUTH_LINKS).doc(token.uid);

  return db.runTransaction(async tx => {
    const now = Timestamp.now();
    const link = await tx.get(linkRef);

    if (link.exists) {
      const ref = docRef(COLLECTIONS.users, Number(link.get("userId")));
      const snap = await tx.get(ref);
      if (snap.exists) {
        const stored = snap.data() as StoredUser;
        const patch: Partial<StoredUser> = {};
        if (now.toMillis() - stored.lastSignedIn.toMillis() > LAST_SIGNED_IN_RESOLUTION_MS) patch.lastSignedIn = now;
        if (email && stored.email !== email) patch.email = email;
        if (!stored.name && token.name) patch.name = token.name;
        if (stored.role !== "admin" && isAdminEmail(token)) patch.role = "admin";
        if (Object.keys(patch).length) tx.update(ref, { ...patch, updatedAt: now });
        return toUser({ ...stored, ...patch });
      }
    }

    // Users migrated from MySQL have no Firebase UID yet; claim them by verified email.
    const migrated = email ? (await tx.get(col(COLLECTIONS.users).where("email", "==", email).where("firebaseUid", "==", null).limit(1))).docs[0] : undefined;
    if (migrated) {
      const stored = migrated.data() as StoredUser;
      const patch: Partial<StoredUser> = { firebaseUid: token.uid, loginMethod, lastSignedIn: now, updatedAt: now, ...(stored.name ? {} : { name: token.name ?? null }), ...(isAdminEmail(token) ? { role: "admin" as const } : {}) };
      tx.update(migrated.ref, patch);
      tx.set(linkRef, { userId: stored.id });
      return toUser({ ...stored, ...patch });
    }

    const [id] = await allocateIds(tx, COLLECTIONS.users);
    const created: StoredUser = { id, firebaseUid: token.uid, name: token.name ?? null, email, loginMethod, role: isAdminEmail(token) ? "admin" : "user", createdAt: now, updatedAt: now, lastSignedIn: now };
    tx.set(docRef(COLLECTIONS.users, id), created);
    tx.set(linkRef, { userId: id });
    return toUser(created);
  });
}
