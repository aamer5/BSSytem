import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { corsForAllowedOrigins } from "./cors";

function run(method: string, origin?: string) {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => { headers[k] = v; }, append: vi.fn(), sendStatus: vi.fn() } as unknown as Response;
  const next = vi.fn();
  corsForAllowedOrigins({ method, headers: origin ? { origin } : {} } as Request, res, next);
  return { headers, next, res: res as unknown as { sendStatus: ReturnType<typeof vi.fn> } };
}

describe("corsForAllowedOrigins", () => {
  it("allows the Firebase Hosting origin", () => {
    const { headers, next } = run("POST", "https://bssytem-27ee8.web.app");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://bssytem-27ee8.web.app");
    expect(next).toHaveBeenCalled();
  });
  it("answers allowed preflights and rejects unknown origins", () => {
    expect(run("OPTIONS", "https://bssytem-27ee8.firebaseapp.com").res.sendStatus).toHaveBeenCalledWith(204);
    const denied = run("OPTIONS", "https://evil.example");
    expect(denied.res.sendStatus).toHaveBeenCalledWith(403);
    expect(denied.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
  it("passes same-origin and server-to-server requests through untouched", () => {
    const { headers, next } = run("GET");
    expect(headers).toEqual({});
    expect(next).toHaveBeenCalled();
  });
});
