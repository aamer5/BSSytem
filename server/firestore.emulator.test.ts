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
    const [head, backup, chair] = await Promise.all([signIn("head@example.com"), signIn("backup@example.com"), signIn("chair@example.com")]).then(users => users.map(user => user!));
    const asAdmin = callerFor(admin);

    // A board is created together with its secretariat head and team.
    const secretariat = { boardHeadUserId: chair.id, secretariatHeadUserId: head.id, secretaryMemberUserIds: [secretary.id, backup.id] };
    await expect(asAdmin.admin.createBoard({ code: "FIN", nameAr: "المالية", ...secretariat, secretaryMemberUserIds: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(asAdmin.admin.createBoard({ code: "FIN", nameAr: "المالية", ...secretariat, secretaryMemberUserIds: [head.id] })).rejects.toThrow("errors.headInTeam");
    await expect(asAdmin.admin.createBoard({ code: "FIN", nameAr: "المالية", ...secretariat, boardHeadUserId: head.id })).rejects.toThrow("errors.boardHeadInSecretariat");
    const { id: boardId } = await asAdmin.admin.createBoard({ code: "FIN", nameAr: "المالية", nameEn: "Finance", ...secretariat });
    await expect(asAdmin.admin.createBoard({ code: "FIN", nameAr: "مكرر", ...secretariat })).rejects.toThrow("errors.boardCodeExists");
    const boardMemberships = (await asAdmin.admin.memberships()).filter(m => m.boardId === boardId);
    expect(boardMemberships.map(m => [m.userId, m.role]).sort()).toEqual([[chair.id, "board_head"], [head.id, "secretariat_head"], [secretary.id, "secretary_member"], [backup.id, "secretary_member"]].sort());
    const { id: specialtyId } = await asAdmin.admin.createSpecialty({ boardId, code: "BUD", nameAr: "الميزانية" });
    await asAdmin.admin.assignMembership({ boardId, userId: requester.id, role: "requester" });
    const secretaryMembership = boardMemberships.find(m => m.userId === secretary.id)!.id;
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
    // The last secretariat head and the last team member can't be removed.
    await expect(asAdmin.admin.deactivateMembership({ membershipId: boardMemberships.find(m => m.userId === backup.id)!.id })).rejects.toThrow("errors.lastSecretaryMember");
    await expect(asAdmin.admin.deactivateMembership({ membershipId: boardMemberships.find(m => m.userId === head.id)!.id })).rejects.toThrow("errors.lastSecretariatHead");
    await expect(asAdmin.admin.deactivateMembership({ membershipId: boardMemberships.find(m => m.userId === chair.id)!.id })).rejects.toThrow("errors.lastBoardHead");
    await expect(callerFor(secretary).requests.detail({ requestId: draft.id, locale: "en" })).resolves.toBeNull();
    expect((await callerFor(secretary).reference.list({ locale: "en" })).boards).toEqual([]);
  });

  it("versions and activates checklist templates and enforces required answers", async () => {
    const admin = (await signIn("chief@example.com"))!;
    const [requester, other] = await Promise.all([signIn("req@example.com"), signIn("other@example.com")]).then(users => users.map(user => user!));
    const asAdmin = callerFor(admin);
    const asRequester = callerFor(requester);
    const [hrStaff, hrChair] = await Promise.all([signIn("hr-staff@example.com"), signIn("hr-chair@example.com")]).then(users => users.map(user => user!));
    const { id: boardId } = await asAdmin.admin.createBoard({ code: "HR", nameAr: "الموارد", boardHeadUserId: hrChair.id, secretariatHeadUserId: admin.id, secretaryMemberUserIds: [hrStaff.id] });
    const { id: specialtyId } = await asAdmin.admin.createSpecialty({ boardId, code: "PAY", nameAr: "الرواتب" });
    const { id: otherSpecialty } = await asAdmin.admin.createSpecialty({ boardId, code: "HIR", nameAr: "التوظيف" });
    for (const user of [requester, other]) await asAdmin.admin.assignMembership({ boardId, userId: user.id, role: "requester" });

    // A board-wide template with Yes/No questions; each may require a note and/or an attachment.
    const { id: boardWide } = await asAdmin.admin.createTemplate({ boardId, nameAr: "عام" });
    await expect(asAdmin.admin.activateTemplate({ templateId: boardWide })).rejects.toThrow("errors.templateHasNoQuestions");
    const { id: approved } = await asAdmin.admin.createQuestion({ checklistTemplateId: boardWide, textAr: "هل اعتمد المدير؟" });
    const { id: budget } = await asAdmin.admin.createQuestion({ checklistTemplateId: boardWide, textAr: "هل الميزانية متوفرة؟", noteRequired: true });
    const { id: signed } = await asAdmin.admin.createQuestion({ checklistTemplateId: boardWide, textAr: "هل العقد موقّع؟", noteRequired: true, attachmentRequired: true });
    await asAdmin.admin.activateTemplate({ templateId: boardWide });
    await expect(asAdmin.admin.createQuestion({ checklistTemplateId: boardWide, textAr: "متأخر" })).rejects.toThrow("errors.templateNotDraft");
    expect((await asAdmin.admin.checklists()).find(t => t.id === boardWide)?.questions.map(q => [q.answerType, q.required, q.noteRequired, q.attachmentRequired])).toEqual([["boolean", true, false, false], ["boolean", true, true, false], ["boolean", true, true, true]]);

    // A specialty template wins over the board-wide one; a second version retires the first when activated.
    const { id: payV1 } = await asAdmin.admin.createTemplate({ boardId, specialtyId, nameAr: "الرواتب" });
    await asAdmin.admin.createQuestion({ checklistTemplateId: payV1, textAr: "سؤال" });
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
    expect(detail?.questions.map(q => q.id)).toEqual([approved, budget, signed]);
    expect(detail?.permissions).toMatchObject({ canAnswerChecklist: true, canUpload: true });
    await expect(callerFor(other).requests.detail({ requestId: draft.id, locale: "en" })).resolves.toBeNull();

    type Parts = { answerValue?: boolean | string | null; comment?: string | null; evidenceAttachmentId?: number | null };
    const answer = (checklistQuestionId: number, parts: Parts, caller = asRequester) => caller.requests.answerChecklist({ requestId: draft.id, checklistQuestionId, ...parts, finalConfirmation: true, locale: "en" });
    const submit = () => asRequester.requests.submit({ requestId: draft.id, expectedRowVersion: 1, locale: "en" });
    const upload = (name: string) => asRequester.requests.attachments.upload({ requestId: draft.id, fileName: name, documentType: "checklist_evidence", mimeType: "application/pdf", dataBase64: Buffer.from(`%PDF ${name}`).toString("base64"), requesterVisible: true, locale: "en" });
    await expect(answer(approved, { answerValue: true }, callerFor(other))).rejects.toThrow("errors.forbidden");
    // Only the request's own requester changes answers; administrators and secretariat staff can't.
    await expect(answer(approved, { answerValue: true }, asAdmin)).rejects.toThrow("errors.forbidden");
    await expect(answer(approved, { answerValue: true }, callerFor(hrStaff))).rejects.toThrow("errors.forbidden");
    await expect(answer(approved, { answerValue: "yes" })).rejects.toThrow("errors.invalidAnswer");

    // Every question needs a Yes/No answer.
    await answer(approved, { answerValue: false });
    await answer(budget, { answerValue: true });
    await answer(signed, { answerValue: true });
    // ...and the notes and attachment its settings require.
    await expect(submit()).rejects.toMatchObject({ code: "BAD_REQUEST", message: "errors.checklistIncomplete" });
    // Parts are saved separately and kept: a note does not clear the answer.
    await answer(budget, { comment: "  Covered by the 2027 budget  " });
    await answer(signed, { comment: "Signed by both parties" });
    await expect(submit()).rejects.toThrow("errors.checklistIncomplete");
    // Attachments must belong to this request.
    const foreign = await callerFor(requester).requests.createDraft({ boardId, specialtyId: otherSpecialty, title: "Another", subjectType: "general", priority: "normal", confidentialityLevel: "standard" });
    const { id: foreignFile } = await asRequester.requests.attachments.upload({ requestId: foreign.id, fileName: "x.pdf", documentType: "checklist_evidence", mimeType: "application/pdf", dataBase64: Buffer.from("x").toString("base64"), locale: "en" });
    await expect(answer(signed, { evidenceAttachmentId: foreignFile })).rejects.toThrow("errors.invalidEvidence");
    const { id: contract } = await upload("contract.pdf");
    await answer(signed, { evidenceAttachmentId: contract });
    const saved = (await asRequester.requests.detail({ requestId: draft.id, locale: "en" }))!;
    expect(saved.answers.find(a => a.checklistQuestionId === budget)).toMatchObject({ answerValue: true, comment: "Covered by the 2027 budget" });
    expect(saved.answers.find(a => a.checklistQuestionId === signed)).toMatchObject({ answerValue: true, comment: "Signed by both parties", evidenceAttachmentId: contract });
    expect(saved.answers.find(a => a.checklistQuestionId === approved)).toMatchObject({ answerValue: false, comment: null });
    await submit();
    await expect(answer(approved, { answerValue: true })).rejects.toThrow("errors.invalidTransition");
  });

  it("walks a request through every workflow step with role and ownership checks", async () => {
    const admin = (await signIn("chief@example.com"))!;
    const [requester, other, head, secretary, boardHead] = await Promise.all(["req@example.com", "other@example.com", "head@example.com", "sec@example.com", "bh@example.com"].map(email => signIn(email))).then(users => users.map(user => user!));
    const asAdmin = callerFor(admin);
    const { id: boardId } = await asAdmin.admin.createBoard({ code: "GOV", nameAr: "الحوكمة", boardHeadUserId: boardHead.id, secretariatHeadUserId: head.id, secretaryMemberUserIds: [secretary.id] });
    const { id: specialtyId } = await asAdmin.admin.createSpecialty({ boardId, code: "POL", nameAr: "السياسات" });
    for (const [userId, role] of [[requester.id, "requester"], [other.id, "requester"]] as const) await asAdmin.admin.assignMembership({ boardId, userId, role });
    expect((await asAdmin.admin.memberships()).filter(m => m.boardId === boardId)).toHaveLength(5);

    const { id } = await callerFor(requester).requests.createDraft({ boardId, specialtyId, title: "Policy update", subjectType: "policy", priority: "normal", confidentialityLevel: "standard" });
    const detailFor = async (user: typeof requester) => (await callerFor(user).requests.detail({ requestId: id, locale: "en" }))!;
    const version = async () => (await detailFor(admin)).request.rowVersion;

    expect((await detailFor(requester)).permissions.actions).toEqual(["submit", "withdraw"]);
    // Drafts are private to their author.
    await expect(callerFor(other).requests.detail({ requestId: id, locale: "en" })).resolves.toBeNull();
    await expect(callerFor(head).requests.detail({ requestId: id, locale: "en" })).resolves.toBeNull();
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

  it("edits drafts, stores files and hides internal material from requesters", async () => {
    const admin = (await signIn("chief@example.com"))!;
    const [requester, other, head, secretary, member, boardHead] = await Promise.all(["req@example.com", "other@example.com", "head@example.com", "sec@example.com", "member@example.com", "bh@example.com"].map(email => signIn(email))).then(users => users.map(user => user!));
    const asAdmin = callerFor(admin);
    const { id: boardId } = await asAdmin.admin.createBoard({ code: "AUD", nameAr: "التدقيق", boardHeadUserId: boardHead.id, secretariatHeadUserId: head.id, secretaryMemberUserIds: [secretary.id] });
    const { id: specialtyId } = await asAdmin.admin.createSpecialty({ boardId, code: "INT", nameAr: "داخلي" });
    for (const [userId, role] of [[requester.id, "requester"], [other.id, "requester"], [member.id, "board_member"]] as const) await asAdmin.admin.assignMembership({ boardId, userId, role });
    const asRequester = callerFor(requester);
    const detail = (user: typeof requester, requestId: number) => callerFor(user).requests.detail({ requestId, locale: "en" });

    // Draft editing: owner only, draft only, optimistic version.
    const { id } = await asRequester.requests.createDraft({ boardId, specialtyId, title: "Audit plan", subjectType: "general", priority: "normal", confidentialityLevel: "standard" });
    expect((await detail(requester, id))?.permissions.canEditDraft).toBe(true);
    const edit = { requestId: id, title: "Annual audit plan", subjectType: "financial", priority: "high", confidentialityLevel: "restricted", description: " Scope and timeline ", objective: "" } as const;
    await expect(callerFor(other).requests.updateDraft({ ...edit, expectedRowVersion: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asAdmin.requests.updateDraft({ ...edit, expectedRowVersion: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asRequester.requests.updateDraft({ ...edit, expectedRowVersion: 5 })).rejects.toMatchObject({ code: "CONFLICT" });
    await asRequester.requests.updateDraft({ ...edit, expectedRowVersion: 1 });
    const edited = (await detail(requester, id))!;
    expect(edited.request).toMatchObject({ title: "Annual audit plan", subjectType: "financial", priority: "high", confidentialityLevel: "restricted", description: "Scope and timeline", objective: null, rowVersion: 2 });
    expect(edited.history[0].action).toBe("edit_draft");

    // Files round-trip through Firestore chunks (> one chunk) and keep their checksum.
    const big = Buffer.alloc(1_600_000, 7);
    big.write("PDF", 0);
    const { id: ownFile } = await asRequester.requests.attachments.upload({ requestId: id, fileName: "plan.pdf", documentType: "supporting_document", mimeType: "application/pdf", dataBase64: big.toString("base64"), requesterVisible: false, locale: "en" });
    const downloaded = await asRequester.requests.attachments.download({ attachmentId: ownFile, locale: "en" });
    expect(Buffer.from(downloaded.dataBase64, "base64").equals(big)).toBe(true);
    expect((await detail(requester, id))?.attachments[0]).toMatchObject({ requesterVisible: true, byteSize: big.byteLength });
    await expect(asRequester.requests.attachments.upload({ requestId: id, fileName: "huge.bin", documentType: "supporting_document", mimeType: "application/octet-stream", dataBase64: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64"), locale: "en" })).rejects.toThrow("errors.fileTooLarge");

    await asRequester.requests.submit({ requestId: id, expectedRowVersion: 2, locale: "en" });
    await expect(asRequester.requests.updateDraft({ ...edit, expectedRowVersion: 3 })).rejects.toMatchObject({ message: "errors.invalidTransition" });

    // Restricted: secretariat and board head yes, board members and other requesters no.
    expect((await detail(member, id))).toBeNull();
    expect((await detail(other, id))).toBeNull();
    expect((await detail(secretary, id))?.audience).toBe("staff");
    expect((await callerFor(member).requests.list({ locale: "en", page: 1, pageSize: 20, requestedByMe: false, assignedToMe: false })).total).toBe(0);

    // Staff material the requester must not see.
    await callerFor(head).requests.transition({ requestId: id, action: "assign", assigneeUserId: secretary.id, expectedRowVersion: 3, locale: "en" });
    const { id: internalFile } = await callerFor(secretary).requests.attachments.upload({ requestId: id, fileName: "notes.txt", documentType: "working_paper", mimeType: "text/plain", dataBase64: Buffer.from("internal").toString("base64"), requesterVisible: false, locale: "en" });
    await callerFor(head).requests.transition({ requestId: id, action: "submit_to_board_head", assigneeUserId: boardHead.id, note: "Recommend approval", expectedRowVersion: 4, locale: "en" });
    await callerFor(boardHead).requests.decide({ requestId: id, outcome: "not_proper", reasonCode: "incomplete", note: "Internal reasoning", requesterVisible: false, expectedRowVersion: 5, locale: "en" });

    const staffView = (await detail(head, id))!;
    expect(staffView.attachments).toHaveLength(2);
    expect(staffView.decisions).toHaveLength(1);
    expect(staffView.snapshots.length).toBeGreaterThan(0);
    const ownerView = (await detail(requester, id))!;
    expect(ownerView.audience).toBe("owner");
    expect(ownerView.attachments.map(a => a.id)).toEqual([ownFile]);
    expect(ownerView.decisions).toEqual([]);
    expect(ownerView.snapshots).toEqual([]);
    expect(ownerView.request).toMatchObject({ lifecycleStatus: "not_proper", decisionNote: null });
    expect(ownerView.history.find(h => h.action === "submit_to_board_head")?.note).toBeNull();
    expect(ownerView.history.find(h => h.action === "decide")?.note).toBeNull();
    expect(JSON.stringify(ownerView)).not.toContain("Internal reasoning");
    await expect(asRequester.requests.attachments.download({ attachmentId: internalFile, locale: "en" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Confidential: only the head, the assigned secretary and the board head.
    const { id: secret } = await asRequester.requests.createDraft({ boardId, specialtyId, title: "Confidential matter", subjectType: "general", priority: "normal", confidentialityLevel: "confidential" });
    await asRequester.requests.submit({ requestId: secret, expectedRowVersion: 1, locale: "en" });
    expect(await detail(secretary, secret)).toBeNull();
    expect((await detail(head, secret))?.audience).toBe("staff");
    await callerFor(head).requests.transition({ requestId: secret, action: "assign", assigneeUserId: secretary.id, expectedRowVersion: 2, locale: "en" });
    expect((await detail(secretary, secret))?.audience).toBe("staff");
  });

  it("lets the secretariat head consult a general secretariat head before the board head", async () => {
    const admin = (await signIn("chief@example.com"))!;
    const [requester, head, secretary, boardHead, general, otherGeneral] = await Promise.all(["req@example.com", "head@example.com", "sec@example.com", "bh@example.com", "gsh@example.com", "gsh2@example.com"].map(email => signIn(email))).then(users => users.map(user => user!));
    const asAdmin = callerFor(admin);
    const { id: boardId } = await asAdmin.admin.createBoard({ code: "LEG", nameAr: "الشؤون القانونية", boardHeadUserId: boardHead.id, secretariatHeadUserId: head.id, secretaryMemberUserIds: [secretary.id] });
    const { id: specialtyId } = await asAdmin.admin.createSpecialty({ boardId, code: "CON", nameAr: "العقود" });
    await asAdmin.admin.assignMembership({ boardId, userId: requester.id, role: "requester" });
    for (const user of [general, otherGeneral]) await asAdmin.admin.setGeneralSecretariatHead({ userId: user.id, enabled: true });
    expect((await asAdmin.admin.users()).filter(u => u.isGeneralSecretariatHead).map(u => u.id).sort()).toEqual([general.id, otherGeneral.id].sort());
    // The signed-in user carries the flag stored on their profile.
    const signInAgain = async (email: string) => (await mod.authenticateRequest(requestWith((await authApi("accounts:signInWithPassword", { email, password: "correct-horse-battery", returnSecureToken: true })).idToken)))!;
    const [generalUser, otherGeneralUser] = await Promise.all([signInAgain("gsh@example.com"), signInAgain("gsh2@example.com")]);
    expect(generalUser.isGeneralSecretariatHead).toBe(true);

    const { id } = await callerFor(requester).requests.createDraft({ boardId, specialtyId, title: "Contract template", subjectType: "legal", priority: "normal", confidentialityLevel: "confidential" });
    // Drafts stay private, even from the general secretariat head.
    await expect(callerFor(generalUser).requests.detail({ requestId: id, locale: "en" })).resolves.toBeNull();
    await callerFor(requester).requests.submit({ requestId: id, expectedRowVersion: 1, locale: "en" });
    await callerFor(head).requests.claim({ requestId: id, expectedRowVersion: 2, locale: "en" });

    const headView = (await callerFor(head).requests.detail({ requestId: id, locale: "en" }))!;
    expect(headView.permissions.actions).toContain("consult_general_head");
    expect(headView.candidates.generalHeads.map(c => c.id).sort()).toEqual([general.id, otherGeneral.id].sort());
    await expect(callerFor(secretary).requests.transition({ requestId: id, action: "consult_general_head", assigneeUserId: general.id, note: "?", expectedRowVersion: 3, locale: "en" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(head).requests.transition({ requestId: id, action: "consult_general_head", assigneeUserId: general.id, expectedRowVersion: 3, locale: "en" })).rejects.toThrow("errors.noteRequired");
    await expect(callerFor(head).requests.transition({ requestId: id, action: "consult_general_head", assigneeUserId: boardHead.id, note: "Advice?", expectedRowVersion: 3, locale: "en" })).rejects.toThrow("errors.invalidAssignee");
    await callerFor(head).requests.transition({ requestId: id, action: "consult_general_head", assigneeUserId: general.id, note: "Is this within our mandate?", expectedRowVersion: 3, locale: "en" });

    // The general head sees confidential work on a board they are not a member of, and only the consulted one replies.
    const list = await callerFor(generalUser).requests.list({ locale: "en", page: 1, pageSize: 20, requestedByMe: false, assignedToMe: true });
    expect(list.items.map(item => item.id)).toEqual([id]);
    expect((await callerFor(generalUser).reference.list({ locale: "en" })).boards.map(b => b.id)).toContain(boardId);
    const generalView = (await callerFor(generalUser).requests.detail({ requestId: id, locale: "en" }))!;
    expect(generalView.request.lifecycleStatus).toBe("under_general_secretariat_review");
    expect(generalView.permissions.actions).toEqual(["respond_consultation"]);
    expect((await callerFor(otherGeneralUser).requests.detail({ requestId: id, locale: "en" }))?.permissions.actions).toEqual([]);
    expect((await callerFor(head).requests.detail({ requestId: id, locale: "en" }))?.permissions.actions).toEqual([]);
    await expect(callerFor(generalUser).requests.transition({ requestId: id, action: "respond_consultation", expectedRowVersion: 4, locale: "en" })).rejects.toThrow("errors.noteRequired");
    await callerFor(generalUser).requests.transition({ requestId: id, action: "respond_consultation", note: "Yes, proceed to the board head", expectedRowVersion: 4, locale: "en" });

    // Back with the secretariat head who asked, who then sends it to the board head.
    const back = (await callerFor(head).requests.detail({ requestId: id, locale: "en" }))!;
    expect(back.request).toMatchObject({ lifecycleStatus: "under_secretariat_review", workStatus: "assigned", currentAssigneeId: head.id });
    expect(back.history.slice(0, 2).map(h => [h.action, h.note])).toEqual([["respond_consultation", "Yes, proceed to the board head"], ["consult_general_head", "Is this within our mandate?"]]);
    await callerFor(head).requests.transition({ requestId: id, action: "submit_to_board_head", assigneeUserId: boardHead.id, expectedRowVersion: 5, locale: "en" });
    expect((await callerFor(boardHead).requests.detail({ requestId: id, locale: "en" }))?.permissions.actions).toEqual(["decide"]);

    // The requester sees the steps but not the consultation notes.
    const ownerView = (await callerFor(requester).requests.detail({ requestId: id, locale: "en" }))!;
    expect(ownerView.history.filter(h => h.action.includes("consult")).map(h => h.note)).toEqual([null, null]);

    await asAdmin.admin.setGeneralSecretariatHead({ userId: general.id, enabled: false });
    const formerGeneral = await signInAgain("gsh@example.com");
    await expect(callerFor(formerGeneral).requests.detail({ requestId: id, locale: "en" })).resolves.toBeNull();
  });

  it("lets a user act as just one of their roles, never more", async () => {
    const { createContext } = await import("./_core/context");
    const adminToken = await idTokenFor("chief@example.com");
    const admin = (await mod.authenticateRequest(requestWith(adminToken)))!;
    const [requester, secretary, boardHead] = await Promise.all(["req@example.com", "sec@example.com", "bh@example.com"].map(email => signIn(email))).then(users => users.map(user => user!));
    const asAdmin = callerFor(admin);
    // The admin is also this board's secretariat head and a requester on it.
    const { id: boardId } = await asAdmin.admin.createBoard({ code: "OPS", nameAr: "العمليات", boardHeadUserId: boardHead.id, secretariatHeadUserId: admin.id, secretaryMemberUserIds: [secretary.id] });
    const { id: specialtyId } = await asAdmin.admin.createSpecialty({ boardId, code: "GEN", nameAr: "عام" });
    for (const userId of [admin.id, requester.id]) await asAdmin.admin.assignMembership({ boardId, userId, role: "requester" });
    const { id: othersRequest } = await callerFor(requester).requests.createDraft({ boardId, specialtyId, title: "Someone else's", subjectType: "general", priority: "normal", confidentialityLevel: "standard" });
    await callerFor(requester).requests.submit({ requestId: othersRequest, expectedRowVersion: 1, locale: "en" });

    const actingAs = async (role?: string) => mod.appRouter.createCaller(await createContext({ req: { headers: { authorization: `Bearer ${adminToken}`, ...(role ? { "x-acting-role": role } : {}) } }, res: {} } as unknown as Parameters<typeof createContext>[0]));
    const me = await (await actingAs()).auth.me();
    expect(me).toMatchObject({ role: "admin", actingRole: null });
    expect(me?.availableRoles.sort()).toEqual(["administrator", "requester", "secretariat_head"].sort());

    // As a requester: no admin pages, only their own requests.
    const asRequesterRole = await actingAs("requester");
    expect(await asRequesterRole.auth.me()).toMatchObject({ role: "user", actingRole: "requester" });
    await expect(asRequesterRole.admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asRequesterRole.requests.detail({ requestId: othersRequest, locale: "en" })).resolves.toBeNull();
    const { id: mine } = await asRequesterRole.requests.createDraft({ boardId, specialtyId, title: "Mine", subjectType: "general", priority: "normal", confidentialityLevel: "standard" });
    expect((await asRequesterRole.requests.list({ locale: "en", page: 1, pageSize: 20, requestedByMe: false, assignedToMe: false })).items.map(i => i.id)).toEqual([mine]);

    // As the secretariat head: sees the submitted request and can work it, but can't draft.
    const asHead = await actingAs("secretariat_head");
    expect((await asHead.requests.detail({ requestId: othersRequest, locale: "en" }))?.permissions.actions).toEqual(["claim", "assign"]);
    await expect(asHead.requests.createDraft({ boardId, specialtyId, title: "Nope", subjectType: "general", priority: "normal", confidentialityLevel: "standard" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // A role the user doesn't hold is ignored rather than granted.
    expect(await (await actingAs("board_head")).auth.me()).toMatchObject({ role: "admin", actingRole: null });
    const plain = mod.appRouter.createCaller(await createContext({ req: { headers: { authorization: `Bearer ${await idTokenFor("plain@example.com")}`, "x-acting-role": "administrator" } }, res: {} } as unknown as Parameters<typeof createContext>[0]));
    expect(await plain.auth.me()).toMatchObject({ role: "user", actingRole: null, availableRoles: [] });
  });

  it("allocates unique ids under concurrent inserts", async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, () => mod.firestore.insertWithId(mod.firestore.COLLECTIONS.requestAttachments, {})));
    expect(new Set(ids).size).toBe(12);
    expect(Math.max(...ids)).toBe(12);
  });
});
