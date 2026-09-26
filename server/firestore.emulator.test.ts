// Integration tests against the Firebase Auth + Firestore emulators.
// Run with `pnpm test:emulator`; skipped by plain `pnpm test`.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import type { User } from "@shared/schema";
import type { TrpcContext } from "./_core/context";

const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT ?? "demo-bssytem";

// Contention tests (concurrent sign-ins and id allocation) retry transactions, which is slow on the emulator.
describe.skipIf(!emulated)("Firestore + Firebase Auth (emulator)", { timeout: 30_000 }, () => {
  let mod: {
    appRouter: typeof import("./routers").appRouter;
    authenticateRequest: typeof import("./_core/auth").authenticateRequest;
    firestore: typeof import("./firestore");
    ENV: typeof import("./_core/env").ENV;
  };

  beforeAll(async () => {
    process.env.FIREBASE_PROJECT_ID = projectId;
    const [{ appRouter }, { authenticateRequest }, firestore, { ENV }] = await Promise.all([import("./routers"), import("./_core/auth"), import("./firestore"), import("./_core/env")]);
    ENV.firebaseProjectId = projectId;
    ENV.adminEmails = ["chief@example.com"];
    mod = { appRouter, authenticateRequest, firestore, ENV };
  });

  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });
  });

  const authApi = (path: string, body: unknown) => fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/${path}?key=fake-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(res => res.json() as Promise<{ idToken: string; localId: string }>);

  async function idTokenFor(email: string, { verified = true, name }: { verified?: boolean; name?: string } = {}) {
    const { localId } = await authApi("accounts:signUp", { email, password: "correct-horse-battery", returnSecureToken: true });
    await mod.firestore.getFirebaseAuth().updateUser(localId, { emailVerified: verified, ...(name ? { displayName: name } : {}) });
    const { idToken } = await authApi("accounts:signInWithPassword", { email, password: "correct-horse-battery", returnSecureToken: true });
    return idToken;
  }

  const requestWith = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} }) as TrpcContext["req"];
  const callerFor = (user: User) => mod.appRouter.createCaller({ user, req: requestWith(), res: { clearCookie: () => undefined } as unknown as TrpcContext["res"] });
  const signIn = async (email: string, options?: { verified?: boolean; name?: string }) => mod.authenticateRequest(requestWith(await idTokenFor(email, options)));

  it("rejects missing, invalid and unverified tokens", async () => {
    await expect(mod.authenticateRequest(requestWith())).resolves.toBeNull();
    await expect(mod.authenticateRequest(requestWith("not-a-token"))).rejects.toThrow();
    await expect(signIn("pending@example.com", { verified: false })).resolves.toBeNull();
  });

  it("creates one user per Firebase account and promotes ADMIN_EMAILS", async () => {
    const token = await idTokenFor("Chief@Example.com", { name: "Chief" });
    const [first, second] = await Promise.all([mod.authenticateRequest(requestWith(token)), mod.authenticateRequest(requestWith(token))]);
    expect(first?.id).toBe(second?.id);
    expect(first).toMatchObject({ email: "chief@example.com", name: "Chief", role: "admin" });
    expect(first?.createdAt).toBeInstanceOf(Date);
    const member = await signIn("member@example.com");
    expect(member).toMatchObject({ role: "user" });
    expect(member!.id).toBeGreaterThan(first!.id);
  });

  it("links a migrated MySQL user by verified email and keeps its id", async () => {
    const now = Timestamp.now();
    await mod.firestore.docRef(mod.firestore.COLLECTIONS.users, 42).set({ id: 42, firebaseUid: null, name: "Legacy", email: "legacy@example.com", loginMethod: "manus", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now });
    await mod.firestore.ensureCounterAtLeast(mod.firestore.COLLECTIONS.users, 42);
    const linked = await signIn("legacy@example.com");
    expect(linked).toMatchObject({ id: 42, name: "Legacy", role: "admin", loginMethod: "password" });
    expect(linked?.firebaseUid).toBeTruthy();
    const fresh = await signIn("new@example.com");
    expect(fresh?.id).toBe(43);
  });

  it("runs the request workflow with board-scoped access and optimistic versions", async () => {
    const admin = (await signIn("chief@example.com"))!;
    const requester = (await signIn("requester@example.com"))!;
    const secretary = (await signIn("secretary@example.com"))!;
    const outsider = (await signIn("outsider@example.com"))!;
    const asAdmin = callerFor(admin);

    const { id: boardId } = await asAdmin.admin.createBoard({ code: "FIN", nameAr: "المالية", nameEn: "Finance" });
    await expect(asAdmin.admin.createBoard({ code: "FIN", nameAr: "مكرر" })).rejects.toThrow("Board code already exists");
    const { id: specialtyId } = await asAdmin.admin.createSpecialty({ boardId, code: "BUD", nameAr: "الميزانية" });
    await asAdmin.admin.assignMembership({ boardId, userId: requester.id, role: "requester" });
    const { id: secretaryMembership } = await asAdmin.admin.assignMembership({ boardId, userId: secretary.id, role: "secretary_member" });
    await expect(asAdmin.admin.assignMembership({ boardId, userId: requester.id, role: "requester" })).rejects.toThrow("Membership already exists");

    const draft = await callerFor(requester).requests.createDraft({ boardId, specialtyId, title: "Budget review", subjectType: "financial", priority: "high", confidentialityLevel: "standard" });
    expect(draft.referenceNumber).toMatch(/^SR-\d{4}-/);
    await expect(callerFor(outsider).requests.createDraft({ boardId, specialtyId, title: "Nope", subjectType: "general", priority: "low", confidentialityLevel: "standard" })).rejects.toThrow();

    await expect(callerFor(requester).requests.submit({ requestId: draft.id, expectedRowVersion: 99, locale: "en" })).rejects.toThrow("Version conflict");
    const submitted = await callerFor(requester).requests.submit({ requestId: draft.id, expectedRowVersion: 1, locale: "en" });
    expect(submitted.rowVersion).toBe(2);
    const claimed = await callerFor(secretary).requests.claim({ requestId: draft.id, expectedRowVersion: 2, locale: "en" });
    expect(claimed.rowVersion).toBe(3);
    await expect(callerFor(secretary).requests.claim({ requestId: draft.id, expectedRowVersion: 3, locale: "en" })).rejects.toThrow();

    await callerFor(requester).requests.answerChecklist({ requestId: draft.id, checklistQuestionId: 7, answerValue: "first", finalConfirmation: false, locale: "en" });
    await callerFor(requester).requests.answerChecklist({ requestId: draft.id, checklistQuestionId: 7, answerValue: "second", finalConfirmation: true, locale: "en" });

    const detail = await callerFor(secretary).requests.detail({ requestId: draft.id, locale: "en" });
    expect(detail?.request).toMatchObject({ lifecycleStatus: "under_secretariat_review", workStatus: "assigned", currentAssigneeId: secretary.id, rowVersion: 3 });
    expect(detail?.requester.email).toBe("requester@example.com");
    expect(detail?.history.map(entry => entry.action)).toEqual(["claim", "submit", "create_draft"]);
    expect(detail?.snapshots).toHaveLength(1);
    expect(detail?.answers).toHaveLength(1);
    expect(detail?.answers[0]).toMatchObject({ answerValue: "second", finalConfirmation: true });
    await expect(callerFor(outsider).requests.detail({ requestId: draft.id, locale: "en" })).resolves.toBeNull();

    const list = await callerFor(secretary).requests.list({ locale: "en", search: "BUDGET", page: 1, pageSize: 20, requestedByMe: false, assignedToMe: true });
    expect(list.items.map(item => ({ id: item.id, boardNameEn: item.boardNameEn, specialtyNameAr: item.specialtyNameAr }))).toEqual([{ id: draft.id, boardNameEn: "Finance", specialtyNameAr: "الميزانية" }]);
    expect((await callerFor(outsider).requests.list({ locale: "en", page: 1, pageSize: 20, requestedByMe: false, assignedToMe: false })).total).toBe(0);
    expect(await callerFor(admin).dashboard.summary({ locale: "en" })).toMatchObject({ total: 1, inReview: 1, pending: 1 });

    await asAdmin.admin.deactivateMembership({ membershipId: secretaryMembership });
    await expect(callerFor(secretary).requests.detail({ requestId: draft.id, locale: "en" })).resolves.toBeNull();
    expect((await callerFor(secretary).reference.list({ locale: "en" })).boards).toEqual([]);
  });

  it("allocates unique ids under concurrent inserts", async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, () => mod.firestore.insertWithId(mod.firestore.COLLECTIONS.requestAttachments, {})));
    expect(new Set(ids).size).toBe(12);
    expect(Math.max(...ids)).toBe(12);
  });
});
