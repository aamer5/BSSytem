import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type DocumentReference, type Firestore, type Query, type Transaction } from "firebase-admin/firestore";
import { ENV } from "./_core/env";

// Collection names mirror the previous MySQL table names so exported data and
// migration logs are easy to line up.
export const COLLECTIONS = {
  users: "users",
  boards: "boards",
  specialties: "specialties",
  boardMemberships: "board_memberships",
  checklistTemplates: "checklist_templates",
  checklistQuestions: "checklist_questions",
  subjectRequests: "subject_requests",
  checklistAnswers: "checklist_answers",
  checklistAnswerEdits: "checklist_answer_edits",
  requestAssignments: "request_assignments",
  requestDecisions: "request_decisions",
  requestHistory: "request_history",
  requestSnapshots: "request_snapshots",
  requestAttachments: "request_attachments",
} as const;
export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
const COUNTERS = "_counters";

let app: App | null = null;
let db: Firestore | null = null;

// Credentials resolve in this order: FIREBASE_SERVICE_ACCOUNT (JSON string),
// then Application Default Credentials (Cloud Run service identity,
// GOOGLE_APPLICATION_CREDENTIALS, or `gcloud auth application-default login`).
// FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are honoured by the SDK.
export function getFirebaseApp() {
  if (app) return app;
  app = getApps()[0] ?? initializeApp({ ...(ENV.firebaseServiceAccount ? { credential: cert(JSON.parse(ENV.firebaseServiceAccount)) } : {}), ...(ENV.firebaseProjectId ? { projectId: ENV.firebaseProjectId } : {}) });
  return app;
}

export function getDb() {
  if (db) return db;
  db = getFirestore(getFirebaseApp());
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export const getFirebaseAuth = () => getAuth(getFirebaseApp());

export const col = (name: CollectionName) => getDb().collection(name);
export const docRef = (name: CollectionName, id: number) => col(name).doc(String(id));

export async function getById<T>(name: CollectionName, id: number) {
  const snap = await docRef(name, id).get();
  return snap.exists ? (snap.data() as T) : undefined;
}

// Fetches many documents by id in one round trip; missing ids are skipped.
export async function getManyById<T>(name: CollectionName, ids: Iterable<number>) {
  const unique = Array.from(new Set(ids));
  if (!unique.length) return new Map<number, T>();
  const snaps = await getDb().getAll(...unique.map(id => docRef(name, id)));
  return new Map(snaps.filter(snap => snap.exists).map(snap => [Number(snap.id), snap.data() as T]));
}

export async function queryAll<T>(query: Query) {
  return (await query.get()).docs.map(snap => snap.data() as T);
}

// Firestore `in` filters accept at most 30 values, so larger sets are chunked.
export async function queryIn<T>(name: CollectionName, field: string, values: number[]) {
  const unique = Array.from(new Set(values));
  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  const results = await Promise.all(chunks.map(chunk => queryAll<T>(col(name).where(field, "in", chunk))));
  return results.flat();
}

// Allocates one sequential numeric id per requested collection. Firestore
// transactions must finish all reads before any write, so reserve every id a
// transaction needs in a single call, after its other reads and before writes.
export async function allocateIds(tx: Transaction, ...names: CollectionName[]) {
  const unique = Array.from(new Set(names));
  const refs = unique.map(name => getDb().collection(COUNTERS).doc(name));
  const snaps = await tx.getAll(...refs);
  const next = new Map(unique.map((name, index) => [name, Number(snaps[index].get("value") ?? 0)]));
  const ids = names.map(name => { const value = next.get(name)! + 1; next.set(name, value); return value; });
  unique.forEach((name, index) => tx.set(refs[index], { value: next.get(name) }));
  return ids;
}

export async function insertWithId<T extends { id: number }>(name: CollectionName, data: Omit<T, "id">) {
  return getDb().runTransaction(async tx => {
    const [id] = await allocateIds(tx, name);
    tx.set(docRef(name, id), { ...data, id });
    return id;
  });
}

// Raises the counter for a collection to at least `value` (used by the migration).
export async function ensureCounterAtLeast(name: CollectionName, value: number) {
  const ref = getDb().collection(COUNTERS).doc(name);
  await getDb().runTransaction(async tx => {
    const current = Number((await tx.get(ref)).get("value") ?? 0);
    if (value > current) tx.set(ref, { value });
  });
}

export type { DocumentReference, Transaction };
