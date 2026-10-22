// The HTTP server: security headers, rate limits, the checks on every request, the routes, and
// the built app beside /api when there is one.
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type { Config } from "./config.js";
import type { Sql } from "./db.js";
import { ApiError } from "./http.js";
import { loadAuth, type Auth } from "./sessions.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { meRoutes } from "./routes/me.js";

declare module "fastify" {
  interface FastifyRequest { auth: Auth | null }
}

/** The first-run setup code: set while there is no account yet. */
export interface SetupCode { code: () => string | null; done: () => void }

export interface Ctx {
  sql: Sql;
  cfg: Config;
  setup: SetupCode;
  /** Sign-in tries a minute from one address (default 10). */
  authLimit?: number;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp(ctx: Ctx, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const { sql, cfg } = ctx;
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: cfg.trustProxy, bodyLimit: 1 << 20 });

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        // (laz-perf reads LiDAR in WebAssembly)
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        // (map tiles, elevation, OpenStreetMap, geocoding and LiDAR come from many hosts)
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:", "data:", "blob:"],
        workerSrc: ["'self'", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false }
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    reply.header("cache-control", "no-store");
    if (!SAFE.has(req.method)) {
      // Requests that change things: only from the app itself (a header other sites can't send
      // without asking first, an allowed origin, and the browser saying it's this site)
      if (req.headers["x-hyzerlab"] !== "1") throw new ApiError(403, "Refused");
      const origin = req.headers.origin;
      if (origin && !cfg.origins.includes(origin)) throw new ApiError(403, "Refused");
      const site = req.headers["sec-fetch-site"];
      if (site && site !== "same-origin") throw new ApiError(403, "Refused");
    }
    req.auth = await loadAuth(sql, req);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: err.message });
    const e = err as { statusCode?: number; code?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: "Too many tries. Wait a minute" });
    if (e.code === "23505") return reply.status(409).send({ error: "That's taken" });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: "Invalid request" });
    req.log.error(err);
    return reply.status(500).send({ error: "Something went wrong" });
  });

  await app.register(async a => authRoutes(a, ctx));
  await app.register(async a => adminRoutes(a, ctx));
  await app.register(async a => meRoutes(a, ctx));
  app.get("/api/health", async () => ({ ok: true }));
  app.all("/api/*", async () => { throw new ApiError(404, "Not found"); });

  if (cfg.staticDir) {
    await app.register(fastifyStatic, {
      root: cfg.staticDir,
      // (hashed file names never change: cache them; the page itself is always asked for again)
      setHeaders: (res, path) => res.header("cache-control", /\/assets\//.test(path.replace(/\\/g, "/")) ? "public, max-age=31536000, immutable" : "no-cache")
    });
  }
  return app;
}
