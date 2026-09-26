import type { NextFunction, Request, Response } from "express";
import { ENV } from "./env";

// Allows the configured website origins to call the API from the browser.
// Requests authenticate with a Bearer ID token, so no cookies are needed.
export function corsForAllowedOrigins(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && ENV.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, trpc-accept");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
    res.append("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(origin && ENV.allowedOrigins.includes(origin) ? 204 : 403);
    return;
  }
  next();
}
