// One-time copy of the legacy MySQL database into Firestore.
//
//   LEGACY_DATABASE_URL=mysql://user:pass@host:3306/db \
//   FIREBASE_PROJECT_ID=bssytem-27ee8 \
//   pnpm migrate:firestore [--dry-run] [--overwrite]
//
// Firebase credentials resolve like the server (FIREBASE_SERVICE_ACCOUNT or
// Application Default Credentials). Each row becomes a document whose ID is the
// old numeric primary key, and the per-collection id counters are raised past
// the largest migrated id. Users keep their ids, memberships and history; their
// `firebaseUid` starts empty and is linked the first time they sign in with
// Firebase Authentication using the same (verified) email address.
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { Timestamp } from "firebase-admin/firestore";
import { col, COLLECTIONS, ensureCounterAtLeast, getDb, type CollectionName } from "../server/firestore";
import * as legacy from "./legacyMysqlSchema";

const dryRun = process.argv.includes("--dry-run");
const overwrite = process.argv.includes("--overwrite");

type Row = Record<string, unknown> & { id: number };
const toTimestamp = (value: unknown) => Timestamp.fromDate(value instanceof Date ? value : new Date(Number(value ?? Date.now())));

const plan: Array<{ table: MySqlTable; collection: CollectionName; transform?: (row: Row) => Record<string, unknown> }> = [
  { table: legacy.users, collection: COLLECTIONS.users, transform: ({ openId: _openId, ...row }) => ({ ...row, firebaseUid: null, email: typeof row.email === "string" ? row.email.trim().toLowerCase() : null, loginMethod: row.loginMethod ?? null, createdAt: toTimestamp(row.createdAt), updatedAt: toTimestamp(row.updatedAt), lastSignedIn: toTimestamp(row.lastSignedIn) }) },
  { table: legacy.boards, collection: COLLECTIONS.boards },
  { table: legacy.specialties, collection: COLLECTIONS.specialties },
  { table: legacy.boardMemberships, collection: COLLECTIONS.boardMemberships },
  { table: legacy.checklistTemplates, collection: COLLECTIONS.checklistTemplates },
  { table: legacy.checklistQuestions, collection: COLLECTIONS.checklistQuestions },
  { table: legacy.subjectRequests, collection: COLLECTIONS.subjectRequests },
  { table: legacy.checklistAnswers, collection: COLLECTIONS.checklistAnswers },
  { table: legacy.checklistAnswerEdits, collection: COLLECTIONS.checklistAnswerEdits },
  { table: legacy.requestAssignments, collection: COLLECTIONS.requestAssignments },
  { table: legacy.requestDecisions, collection: COLLECTIONS.requestDecisions },
  { table: legacy.requestHistory, collection: COLLECTIONS.requestHistory },
  { table: legacy.requestSnapshots, collection: COLLECTIONS.requestSnapshots },
  { table: legacy.requestAttachments, collection: COLLECTIONS.requestAttachments },
];

async function main() {
  const url = process.env.LEGACY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set LEGACY_DATABASE_URL to the MySQL connection string");
  const mysql = drizzle(url);
  const firestore = getDb();

  if (!overwrite) {
    for (const { collection } of plan) {
      if (!(await col(collection).limit(1).get()).empty) throw new Error(`Firestore collection "${collection}" already has documents. Re-run with --overwrite to replace documents that share an id.`);
    }
  }

  for (const { table, collection, transform } of plan) {
    const rows = (await mysql.select().from(table)) as Row[];
    const maxId = rows.reduce((max, row) => Math.max(max, row.id), 0);
    console.log(`${collection}: ${rows.length} rows (max id ${maxId})${dryRun ? " [dry run]" : ""}`);
    if (dryRun) continue;
    const writer = firestore.bulkWriter();
    for (const row of rows) writer.set(col(collection).doc(String(row.id)), transform ? transform(row) : row);
    await writer.close();
    await ensureCounterAtLeast(collection, maxId);
  }

  console.log(dryRun ? "Dry run complete; nothing was written." : "Migration complete.");
  process.exit(0);
}

main().catch(error => {
  console.error("Migration failed:", error);
  process.exit(1);
});
