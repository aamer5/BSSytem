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
    await expect(asAdmin.admin.assignMembership({ boardId, userId: requester.id, role: "requester" })).rejects.toThrow("errors.membershipExists");

    const draft = await callerFor(requester).requests.createDraft({ boardId, specialtyId, title: "Budget review", subjectType: "financial", priority: "high", confidentialityLevel: "standard" });
    expect(draft.referenceNumber).toMatch(/^SR-\d{4}-/);
    await expect(callerFor(outsider).requests.createDraft({ boardId, specialtyId, title: "Nope", subjectType: "general", priority: "low", confidentialityLevel: "standard" })).rejects.toThrow();

    await expect(callerFor(requester).requests.submit({ requestId: draft.id, expectedRowVersion: 99, locale: "en" })).rejects.toMatchObject({ code: "CONFLICT", message: "errors.versionConflict" });
    const submitted = await callerFor(requester).requests.submit({ requestId: draft.id, expectedRowVersion: 1, locale: "en" });
    expect(submitted.rowVersion).toBe(2);
    const claimed = await callerFor(secretary).requests.claim({ requestId: draft.id, expectedRowVersion: 2, locale: "en" });
    expect(claimed.rowVersion).toBe(3);
    await expect(callerFor(secretary).requests.claim({ requestId: draft.id, expectedRowVersion: 3, locale: "en" })).rejects.toThrow();

    await expect(callerFor(requester).requests.answerChecklist({ requestId: draft.id, checklistQuestionId: 7, answerValue: "first", finalConfirmation: false, locale: "en" })).rejects.toThrow("errors.questionNotOnChecklist");

    const detail = await callerFor(secretary).requests.detail({ requestId: draft.id, locale: "en" });
    expect(detail?.request).toMatchObject({ lifecycleStatus: "under_secretariat_review", workStatus: "assigned", currentAssigneeId: secretary.id, rowVersion: 3 });
    expect(detail?.requester.email).toBe("requester@example.com");
    expect(detail?.history.map(entry => entry.action)).toEqual(["claim", "submit", "create_draft"]);
    expect(detail?.snapshots).toHaveLength(1);
    expect(detail?.answers).toHaveLength(0);
    await expect(callerFor(outsider).requests.detail({ requestId: draft.id, locale: "en" })).resolves.toBeNull();

    const list = await callerFor(secretary).requests.list({ locale: "en", search: "BUDGET", page: 1, pageSize: 20, requestedByMe: false, assignedToMe: true });
    expect(list.items.map(item => ({ id: item.id, boardNameEn: item.boardNameEn, specialtyNameAr: item.specialtyNameAr }))).toEqual([{ id: draft.id, boardNameEn: "Finance", specialtyNameAr: "الميزانية" }]);
    expect((await callerFor(outsider).requests.list({ locale: "en", page: 1, pageSize: 20, requestedByMe: false, assignedToMe: false })).total).toBe(0);
    expect(await callerFor(admin).dashboard.summary({ locale: "en" })).toMatchObject({ total: 1, inReview: 1, pending: 1 });

    await asAdmin.admin.deactivateMembership({ membershipId: secretaryMembership });
    await expect(callerFor(secretary).requests.detail({ requestId: draft.id, locale: "en" })).resolves.toBeNull();
    expect((await callerFor(secretary).reference.list({ locale: "en" })).boards).toEqual([]);
  });

  it("versions and activates checklist templates and enforces required answers", async () => {
    const admin = (await signIn("chief@example.com"))!;
    const [requester, other] = await Promise.all([signIn("req@example.com"), signIn("other@example.com")]).then(users => users.map(user => user!));
    const asAdmin = callerFor(admin);
    const asRequester = callerFor(requester);
    const { id: boardId } = await asAdmin.admin.createBoard({ code: "HR", nameAr: "الموارد" });
    const { id: specialtyId } = await asAdmin.admin.createSpecialty({ boardId, code: "PAY", nameAr: "الرواتب" });
    const { id: otherSpecialty } = await asAdmin.admin.createSpecialty({ boardId, code: "HIR", nameAr: "التوظيف" });
    for (const user of [requester, other]) await asAdmin.admin.assignMembership({ boardId, userId: user.id, role: "requester" });

    // A board-wide template with typed questions.
    const { id: boardWide } = await asAdmin.admin.createTemplate({ boardId, nameAr: "عام" });
    await expect(asAdmin.admin.activateTemplate({ templateId: boardWide })).rejects.toThrow("errors.templateHasNoQuestions");
    await expect(asAdmin.admin.createQuestion({ checklistTemplateId: boardWide, textAr: "النوع", answerType: "single_select", options: ["أ"] })).rejects.toThrow("errors.optionsRequired");
    const { id: approved } = await asAdmin.admin.createQuestion({ checklistTemplateId: boardWide, textAr: "هل اعتمد المدير؟", answerType: "boolean", required: true });
    const { id: amount } = await asAdmin.admin.createQuestion({ checklistTemplateId: boardWide, textAr: "المبلغ", answerType: "numeric", required: true });
    const { id: kind } = await asAdmin.admin.createQuestion({ checklistTemplateId: boardWide, textAr: "النوع", answerType: "single_select", options: ["جديد", "تجديد"] });
    await asAdmin.admin.activateTemplate({ templateId: boardWide });
    await expect(asAdmin.admin.createQuestion({ checklistTemplateId: boardWide, textAr: "متأخر", answerType: "text" })).rejects.toThrow("errors.templateNotDraft");

    // A specialty template wins over the board-wide one; a second version retires the first when activated.
    const { id: payV1 } = await asAdmin.admin.createTemplate({ boardId, specialtyId, nameAr: "الرواتب" });
    await asAdmin.admin.createQuestion({ checklistTemplateId: payV1, textAr: "سؤال", answerType: "text" });
    await asAdmin.admin.activateTemplate({ templateId: payV1 });
    const { id: payV2 } = await asAdmin.admin.newTemplateVersion({ templateId: payV1 });
    await asAdmin.admin.activateTemplate({ templateId: payV2 });
    const templates = await asAdmin.admin.checklists();
    expect(templates.filter(t => t.specialtyId === specialtyId).map(t => [t.version, t.status, t.questions.length])).toEqual([[2, "active", 1], [1, "retired", 1]]);
    expect(templates.find(t => t.id === boardWide)?.questions.map(q => q.code)).toEqual(["Q1", "Q2", "Q3"]);

    const payDraft = await asRequester.requests.createDraft({ boardId, specialtyId, title: "Payroll change", subjectType: "general", priority: "normal", confidentialityLevel: "standard" });
    expect((await asRequester.requests.detail({ requestId: payDraft.id, locale: "en" }))?.request.checklistTemplateId).toBe(payV2);

    const draft = await asRequester.requests.createDraft({ boardId, specialtyId: otherSpecialty, title: "New hire", subjectType: "general", priority: "normal", confidentialityLevel: "standard" });
    const detail = await asRequester.requests.detail({ requestId: draft.id, locale: "en" });
    expect(detail?.template?.id).toBe(boardWide);
    expect(detail?.questions.map(q => q.id)).toEqual([approved, amount, kind]);
    expect(detail?.permissions).toMatchObject({ canAnswerChecklist: true, canUpload: true });
    expect((await callerFor(other).requests.detail({ requestId: draft.id, locale: "en" }))?.permissions.canAnswerChecklist).toBe(false);

    const answer = (checklistQuestionId: number, answerValue: string | number | boolean | null, caller = asRequester) => caller.requests.answerChecklist({ requestId: draft.id, checklistQuestionId, answerValue, finalConfirmation: true, locale: "en" });
    await expect(answer(approved, true, callerFor(other))).rejects.toThrow("errors.forbidden");
    await expect(answer(amount, "lots")).rejects.toThrow("errors.invalidAnswer");
    await expect(answer(kind, "other")).rejects.toThrow("errors.invalidAnswer");
    await answer(approved, true);
    await expect(asRequester.requests.submit({ requestId: draft.id, expectedRowVersion: 1, locale: "en" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "errors.checklistIncomplete" });
    await answer(amount, "2500");
    const saved = await asRequester.requests.detail({ requestId: draft.id, locale: "en" });
    expect(saved?.answers.find(a => a.checklistQuestionId === amount)?.answerValue).toBe(2500);
    await asRequester.requests.submit({ requestId: draft.id, expectedRowVersion: 1, locale: "en" });
    await expect(answer(kind, "جديد")).rejects.toThrow("errors.invalidTransition");
  });

  it("walks a request through every workflow step with role and ownership checks", async () => {
    const admin = (await signIn("chief@example.com"))!;
    const [requester, other, head, secretary, boardHead] = await Promise.all(["req@example.com", "other@example.com", "head@example.com", "sec@example.com", "bh@example.com"].map(email => signIn(email))).then(users => users.map(user => user!));
    const asAdmin = callerFor(admin);
    const { id: boardId } = await asAdmin.admin.createBoard({ code: "GOV", nameAr: "الحوكمة" });
    const { id: specialtyId } = await asAdmin.admin.createSpecialty({ boardId, code: "POL", nameAr: "السياسات" });
    for (const [userId, role] of [[requester.id, "requester"], [other.id, "requester"], [head.id, "secretariat_head"], [secretary.id, "secretary_member"], [boardHead.id, "board_head"]] as const) await asAdmin.admin.assignMembership({ boardId, userId, role });
    expect((await asAdmin.admin.memberships()).filter(m => m.boardId === boardId)).toHaveLength(5);

    const { id } = await callerFor(requester).requests.createDraft({ boardId, specialtyId, title: "Policy update", subjectType: "policy", priority: "normal", confidentialityLevel: "standard" });
    const detailFor = async (user: typeof requester) => (await callerFor(user).requests.detail({ requestId: id, locale: "en" }))!;
    const version = async () => (await detailFor(admin)).request.rowVersion;

    expect((await detailFor(requester)).permissions.actions).toEqual(["submit", "withdraw"]);
    expect((await detailFor(other)).permissions.actions).toEqual([]);
    await expect(callerFor(other).requests.submit({ requestId: id, expectedRowVersion: 1, locale: "en" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await callerFor(requester).requests.submit({ requestId: id, expectedRowVersion: 1, locale: "en" });

    const headView = await detailFor(head);
    expect(headView.permissions.actions).toEqual(["claim", "assign"]);
    expect(headView.candidates.secretaries.map(c => c.id).sort()).toEqual([head.id, secretary.id].sort());
    await expect(callerFor(head).requests.transition({ requestId: id, action: "assign", assigneeUserId: requester.id, expectedRowVersion: 2, locale: "en" })).rejects.toMatchObject({ message: "errors.invalidAssignee" });
    await callerFor(head).requests.transition({ requestId: id, action: "assign", assigneeUserId: secretary.id, expectedRowVersion: 2, locale: "en" });

    await expect(callerFor(secretary).requests.transition({ requestId: id, action: "request_info", expectedRowVersion: await version(), locale: "en" })).rejects.toMatchObject({ message: "errors.noteRequired" });
    await callerFor(secretary).requests.transition({ requestId: id, action: "request_info", note: "Please attach the budget", expectedRowVersion: await version(), locale: "en" });
    expect((await detailFor(requester)).permissions.actions).toEqual(["respond_info", "withdraw"]);
    await callerFor(requester).requests.transition({ requestId: id, action: "respond_info", note: "Attached", expectedRowVersion: await version(), locale: "en" });
    expect((await detailFor(admin)).request).toMatchObject({ lifecycleStatus: "under_secretariat_review", currentAssigneeId: secretary.id });

    await expect(callerFor(secretary).requests.transition({ requestId: id, action: "submit_to_board_head", assigneeUserId: boardHead.id, expectedRowVersion: await version(), locale: "en" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await callerFor(head).requests.transition({ requestId: id, action: "submit_to_board_head", assigneeUserId: boardHead.id, expectedRowVersion: await version(), locale: "en" });
    expect((await detailFor(boardHead)).permissions.actions).toEqual(["decide"]);
    await expect(callerFor(admin).requests.decide({ requestId: id, outcome: "proper", reasonCode: "complete", note: "ok", expectedRowVersion: await version(), locale: "en" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await callerFor(boardHead).requests.decide({ requestId: id, outcome: "proper", reasonCode: "complete", note: "Meets all criteria", requesterVisible: true, expectedRowVersion: await version(), locale: "en" });
    await callerFor(head).requests.transition({ requestId: id, action: "archive", expectedRowVersion: await version(), locale: "en" });

    const final = await detailFor(admin);
    expect(final.request).toMatchObject({ lifecycleStatus: "archived", workStatus: "completed", boardHeadOutcome: "proper" });
    expect(final.history.map(h => h.action).reverse()).toEqual(["create_draft", "submit", "assign", "request_info", "respond_info", "submit_to_board_head", "decide", "archive"]);
    expect(final.history.find(h => h.action === "request_info")?.note).toBe("Please attach the budget");
    expect(final.decisions).toHaveLength(1);
    expect(final.permissions.actions).toEqual([]);

    const membership = (await asAdmin.admin.memberships()).find(m => m.userId === other.id)!;
    await asAdmin.admin.deactivateMembership({ membershipId: membership.id });
    await expect(asAdmin.admin.assignMembership({ boardId, userId: other.id, role: "requester" })).resolves.toMatchObject({ id: membership.id, reactivated: true });
  });

  it("allocates unique ids under concurrent inserts", async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, () => mod.firestore.insertWithId(mod.firestore.COLLECTIONS.requestAttachments, {})));
    expect(new Set(ids).size).toBe(12);
    expect(Math.max(...ids)).toBe(12);
  });
});
