// Shared by the routes: errors, input checks, who is asking, and the activity log.
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { Sql } from "./db.js";
import type { Auth, Stage } from "./sessions.js";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value ?? {});
  if (!r.success) throw new ApiError(400, r.error.issues[0]?.message ?? "Invalid request");
  return r.data;
}

/** The request's session, at the stage asked for (signed in, unless said otherwise). */
export function need(req: FastifyRequest, stage: Stage = "full"): Auth {
  const a = req.auth;
  if (!a || a.stage !== stage) throw new ApiError(401, "Sign in first");
  return a;
}

export function needAdmin(req: FastifyRequest): Auth {
  const a = need(req);
  if (!a.user.isAdmin) throw new ApiError(403, "Admins only");
  return a;
}

export const audit = (sql: Sql, req: FastifyRequest, action: string, detail: Record<string, unknown> = {}, userId = req.auth?.user.id ?? null) =>
  sql`insert into audit_log (user_id, action, detail, ip) values (${userId}, ${action}, ${sql.json(detail as never)}, ${req.ip})`;

// --- Input rules

export const username = z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/, "Username: 3 to 32 letters, digits, dots, dashes or underscores");
export const displayName = z.string().trim().min(1, "Name is required").max(60, "Name: at most 60 characters");
export const password = z.string().min(12, "Password: at least 12 characters").max(256, "Password: at most 256 characters");
export const code = z.string().trim().min(6, "Enter the code").max(20);
