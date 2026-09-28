import { describe, expect, it } from "vitest";
import type { BoardRole } from "@shared/domain";
import type { SubjectRequest } from "@shared/schema";
import { requestAudience } from "./visibility";

const request = (overrides: Partial<SubjectRequest> = {}) => ({ requesterUserId: 1, lifecycleStatus: "submitted", confidentialityLevel: "standard", currentAssigneeId: null, assignedSecretaryMemberId: null, ...overrides }) as SubjectRequest;
const viewer = (userId: number, roles: BoardRole[] = [], isAdmin = false) => ({ userId, roles, isAdmin });

describe("request visibility", () => {
  it("keeps drafts private to their author", () => {
    const draft = request({ lifecycleStatus: "draft" });
    expect(requestAudience(viewer(1, ["requester"]), draft)).toBe("owner");
    expect(requestAudience(viewer(2, ["secretariat_head"]), draft)).toBeNull();
    expect(requestAudience(viewer(3, [], true), draft)).toBe("staff");
  });

  it("gives requesters only their own requests", () => {
    expect(requestAudience(viewer(1, ["requester"]), request())).toBe("owner");
    expect(requestAudience(viewer(2, ["requester"]), request())).toBeNull();
  });

  it("narrows staff access by confidentiality level", () => {
    const restricted = request({ confidentialityLevel: "restricted" });
    const confidential = request({ confidentialityLevel: "confidential" });
    expect(requestAudience(viewer(5, ["board_member"]), request())).toBe("staff");
    expect(requestAudience(viewer(5, ["board_member"]), restricted)).toBeNull();
    expect(requestAudience(viewer(6, ["secretary_member"]), restricted)).toBe("staff");
    expect(requestAudience(viewer(6, ["secretary_member"]), confidential)).toBeNull();
    expect(requestAudience(viewer(6, ["secretary_member"]), request({ confidentialityLevel: "confidential", currentAssigneeId: 6 }))).toBe("staff");
    expect(requestAudience(viewer(7, ["secretariat_head"]), confidential)).toBe("staff");
    expect(requestAudience(viewer(8, ["board_head"]), confidential)).toBe("staff");
  });
});
