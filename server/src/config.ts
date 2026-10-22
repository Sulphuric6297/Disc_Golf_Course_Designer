// Settings, all from the environment (see .env.example at the repository's root).

export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  /** Key for secrets kept in the database (2FA secrets): 32 bytes. */
  appSecret: Buffer;
  /** Origins the app is opened from (scheme://host[:port]); requests that change things from
   * any other origin are refused. */
  origins: string[];
  /** Secure cookies even on plain http (otherwise only when the request came over https). */
  forceSecureCookies: boolean;
  /** Proxies whose X-Forwarded-* headers are trusted (Fastify's trustProxy), or false. */
  trustProxy: string | false;
  /** The built app to serve beside /api, or none (the dev server serves it). */
  staticDir: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (k: string) => {
    const v = env[k]?.trim();
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  const appSecret = Buffer.from(need("APP_SECRET"), "base64");
  if (appSecret.length !== 32) throw new Error("APP_SECRET must be 32 bytes, base64 (openssl rand -base64 32)");
  const origins = need("APP_ORIGINS").split(",").map(o => o.trim().replace(/\/+$/, "")).filter(Boolean);
  for (const o of origins) if (!/^https?:\/\/[^/]+$/.test(o)) throw new Error(`APP_ORIGINS: ${o} is not scheme://host[:port]`);
  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: Number(env.PORT) || 8787,
    databaseUrl: need("DATABASE_URL"),
    appSecret,
    origins,
    forceSecureCookies: env.COOKIE_SECURE === "true",
    trustProxy: env.TRUST_PROXY?.trim() || false,
    staticDir: env.STATIC_DIR?.trim() || null
  };
}
