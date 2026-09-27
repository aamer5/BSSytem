import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { DomainError } from "../domain/errors";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const domain = error.cause instanceof DomainError ? error.cause : null;
    return { ...shape, data: { ...shape.data, domainCode: domain?.code ?? null, details: domain?.details ?? null } };
  },
});

const domainToTrpcCode = {
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VERSION_CONFLICT: "CONFLICT",
  CLAIM_CONFLICT: "CONFLICT",
  INVALID_TRANSITION: "PRECONDITION_FAILED",
  VALIDATION_FAILED: "BAD_REQUEST",
  NO_ACTIVE_CHECKLIST: "PRECONDITION_FAILED",
} as const satisfies Record<string, TRPCError["code"]>;

// Business-rule errors become proper tRPC errors (403, 404, 409, ...) whose
// message is the translation key, e.g. "errors.versionConflict".
const domainErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof DomainError) {
    const domain = result.error.cause;
    throw new TRPCError({ code: domainToTrpcCode[domain.code as keyof typeof domainToTrpcCode] ?? "BAD_REQUEST", message: domain.messageKey, cause: domain });
  }
  return result;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(domainErrors);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireUser);

export const adminProcedure = publicProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
