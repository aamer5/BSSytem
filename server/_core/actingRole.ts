import { AsyncLocalStorage } from "node:async_hooks";
import type { BoardRole } from "@shared/domain";
import type { BoardMembership, User } from "@shared/schema";

// "Act as one of my roles": a user holding several roles can ask the API to
// treat them as holding just one, to see and test that role's experience.
// It only ever narrows access; a role the user doesn't hold is ignored.
export const ACTING_ROLE_HEADER = "x-acting-role";

type MembershipRole = BoardMembership["role"];
// null: no narrowing. Otherwise only memberships with this role count ("none" hides them all).
const membershipScope = new AsyncLocalStorage<MembershipRole | "none" | null>();

export function rolesHeldBy(user: Pick<User, "role" | "isGeneralSecretariatHead">, memberships: Pick<BoardMembership, "role">[]): BoardRole[] {
  const roles: BoardRole[] = [];
  if (user.role === "admin") roles.push("administrator");
  if (user.isGeneralSecretariatHead) roles.push("general_secretariat_head");
  for (const membership of memberships) if (!roles.includes(membership.role)) roles.push(membership.role);
  return roles;
}

// The user as the API should see them while acting as `requested`.
export function actAs(user: User, requested: string | undefined, memberships: Pick<BoardMembership, "role">[]) {
  const availableRoles = rolesHeldBy(user, memberships);
  const actingRole = availableRoles.includes(requested as BoardRole) ? (requested as BoardRole) : null;
  if (!actingRole) return { user, actingRole, availableRoles, scope: null };
  const effective: User = { ...user, role: actingRole === "administrator" ? "admin" : "user", isGeneralSecretariatHead: actingRole === "general_secretariat_head" };
  const scope: MembershipRole | "none" = actingRole === "administrator" || actingRole === "general_secretariat_head" ? "none" : actingRole;
  return { user: effective, actingRole, availableRoles, scope };
}

export function runWithMembershipScope<T>(scope: MembershipRole | "none" | null, fn: () => T) {
  return membershipScope.run(scope, fn);
}

// Applied to every membership lookup for the signed-in user.
export function scopeMemberships<T extends Pick<BoardMembership, "role">>(memberships: T[]) {
  const scope = membershipScope.getStore();
  if (!scope) return memberships;
  return scope === "none" ? [] : memberships.filter(membership => membership.role === scope);
}
