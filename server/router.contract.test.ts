import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("router contract", () => {
  it("keeps unauthenticated auth state explicit", async () => {
    const ctx = {
      user: null,
      req: { protocol: "https", headers: {} },
      res: {} as TrpcContext["res"],
    } as TrpcContext;
    await expect(appRouter.createCaller(ctx).auth.me()).resolves.toBeNull();
  });

  it("protects signed attachment access", async () => { const ctx = { user: null, req: { protocol: "https", headers: {} }, res: {} as TrpcContext["res"] } as TrpcContext; await expect(appRouter.createCaller(ctx).requests.attachments.signedUrl({ attachmentId: 1, locale: "ar" })).rejects.toMatchObject({ code: "UNAUTHORIZED" }); });

  it("exposes the recovered feature namespaces", () => {
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["requests.list"]).toBeDefined();
    expect(procedures["requests.attachments.upload"]).toBeDefined(); expect(procedures["requests.attachments.signedUrl"]).toBeDefined();
    expect(procedures["admin.createQuestion"]).toBeDefined();
  });
});
