// Attachment files are kept in Firestore, split into chunks below the 1 MiB
// document limit. This works on the free Spark plan, where Cloud Storage
// buckets are not available.
import { createHash, randomUUID } from "node:crypto";
import { col, COLLECTIONS, getDb } from "./firestore";
import { DomainError } from "./domain/errors";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CHUNK_BYTES = 700 * 1024;
const KEY_PREFIX = "firestore:";

const chunkId = (key: string, index: number) => `${key.slice(KEY_PREFIX.length)}_${index}`;

export async function storeFile(data: Buffer) {
  if (data.byteLength === 0) throw new DomainError("VALIDATION_FAILED", "errors.fileEmpty");
  if (data.byteLength > MAX_FILE_BYTES) throw new DomainError("VALIDATION_FAILED", "errors.fileTooLarge");
  const key = `${KEY_PREFIX}${randomUUID()}`;
  const chunks = Math.ceil(data.byteLength / CHUNK_BYTES);
  try {
    // One chunk per batch keeps each write well under Firestore's request size limit.
    for (let index = 0; index < chunks; index++) {
      await col(COLLECTIONS.attachmentChunks).doc(chunkId(key, index)).set({ storageKey: key, index, chunks, data: data.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES) });
    }
  } catch (error) {
    await deleteFile(key).catch(() => undefined);
    throw error;
  }
  return { key, byteSize: data.byteLength, checksumSha256: createHash("sha256").update(data).digest("hex") };
}

export async function readFile(key: string) {
  if (!key.startsWith(KEY_PREFIX)) throw new DomainError("NOT_FOUND", "errors.fileUnavailable");
  const first = await col(COLLECTIONS.attachmentChunks).doc(chunkId(key, 0)).get();
  if (!first.exists) throw new DomainError("NOT_FOUND", "errors.fileUnavailable");
  const count = Number(first.get("chunks"));
  const rest = count > 1 ? await getDb().getAll(...Array.from({ length: count - 1 }, (_, i) => col(COLLECTIONS.attachmentChunks).doc(chunkId(key, i + 1)))) : [];
  const parts = [first, ...rest].map(doc => {
    if (!doc.exists) throw new DomainError("NOT_FOUND", "errors.fileUnavailable");
    return Buffer.from(doc.get("data") as Uint8Array);
  });
  return Buffer.concat(parts);
}

export async function deleteFile(key: string) {
  const docs = await col(COLLECTIONS.attachmentChunks).where("storageKey", "==", key).get();
  await Promise.all(docs.docs.map(doc => doc.ref.delete()));
}
