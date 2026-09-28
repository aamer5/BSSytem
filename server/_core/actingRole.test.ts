import { describe, expect, it } from "vitest";
import type { User } from "@shared/schema";
import { actAs, rolesHeldBy, runWithMembershipScope, scopeMemberships } from "./actingRole";

const user = (overrides: Partial<User> = {}): User => ({ id: 1, firebaseUid: "u", name: "A", email: "a@example.com", loginMethod: "password", role: "admin", isGeneralSecretariatHead: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...overrides });
const memberships = [{ role: "requester" as const }, { role: "secretariat_head" as const }, { role: "requester" as const }];

describe("acting as one role", () => {
  it("lists every role the user holds once", () => {
    expect(rolesHeldBy(user(), memberships)).toEqual(["administrator", "general_secretariat_head", "requester", "secretariat_head"]);
    expect(rolesHeldBy(user({ role: "user", isGeneralSecretariatHead: false }), [])).toEqual([]);
  });

  it("narrows the user to the chosen role and ignores roles they don't hold", () => {
    expect(actAs(user(), undefined, memberships)).toMatchObject({ actingRole: null, scope: null, user: { role: "admin", isGeneralSecretariatHead: true } });
    expect(actAs(user(), "requester", memberships)).toMatchObject({ actingRole: "requester", scope: "requester", user: { role: "user", isGeneralSecretariatHead: false } });
    expect(actAs(user(), "general_secretariat_head", memberships)).toMatchObject({ scope: "none", user: { role: "user", isGeneralSecretariatHead: true } });
    expect(actAs(user(), "administrator", memberships)).toMatchObject({ scope: "none", user: { role: "admin", isGeneralSecretariatHead: false } });
    // Never widens: a role the user doesn't hold is ignored.
    expect(actAs(user({ role: "user" }), "administrator", memberships)).toMatchObject({ actingRole: null, user: { role: "user" } });
    expect(actAs(user(), "board_head", memberships)).toMatchObject({ actingRole: null, scope: null });
  });

  it("filters membership lookups inside the scope only", async () => {
    expect(scopeMemberships(memberships)).toHaveLength(3);
    await runWithMembershipScope("secretariat_head", async () => {
      await Promise.resolve();
      expect(scopeMemberships(memberships)).toEqual([{ role: "secretariat_head" }]);
    });
    expect(runWithMembershipScope("none", () => scopeMemberships(memberships))).toEqual([]);
  });
});
