import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { BoardRole } from "@shared/domain";
import type { User } from "@shared/schema";
import { getAllActiveMemberships } from "../db";
import { ACTING_ROLE_HEADER, actAs } from "./actingRole";
import { authenticateRequest } from "./auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  // Set when the user asked to act as one of their roles (see actingRole.ts).
  acting?: { role: BoardRole | null; availableRoles: BoardRole[]; scope: ReturnType<typeof actAs>["scope"] };
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }
  if (!user) return { req: opts.req, res: opts.res, user };

  const header = opts.req.headers[ACTING_ROLE_HEADER];
  const acting = actAs(user, typeof header === "string" ? header : undefined, await getAllActiveMemberships(user.id));
  return {
    req: opts.req,
    res: opts.res,
    user: acting.user,
    acting: { role: acting.actingRole, availableRoles: acting.availableRoles, scope: acting.scope },
  };
}
