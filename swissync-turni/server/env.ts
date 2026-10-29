/** Minimal D1 surface the server uses (Cloudflare D1, or SQLite in development and tests). */
export interface DbStatement {
  bind(...values: unknown[]): DbStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}

export interface Db {
  prepare(sql: string): DbStatement;
}

/** Configuration and bindings of the server (Worker vars/secrets, or .env.local in development). */
export interface ServerEnv {
  // xAI
  XAI_API_KEY?: string;
  XAI_MODEL?: string;
  XAI_REASONING?: string;
  /** OpenAI-compatible base URL (default https://api.x.ai/v1); useful for gateways and tests. */
  XAI_BASE_URL?: string;
  /** Requests per IP and day paid by the service (abuse guard). */
  AI_DAILY_LIMIT?: string;
  /** xAI analyses per account and month (default 6). */
  AI_MONTHLY_LIMIT?: string;
  ALLOWED_ORIGINS?: string;
  // Accounts
  DB?: Db;
  /** Secret used to hash codes and encrypt stored tokens. */
  TOKEN_SECRET?: string;
  PUBLIC_URL?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  /** Google OAuth client ids accepted in ID tokens (web, iOS, Android), comma separated. */
  GOOGLE_CLIENT_IDS?: string;
  /** Google web client id handed to the app (sign-in button). */
  GOOGLE_WEB_CLIENT_ID?: string;
  GOOGLE_IOS_CLIENT_ID?: string;
  /** Apple client ids accepted in ID tokens: app bundle id and web Services ID, comma separated. */
  APPLE_CLIENT_IDS?: string;
  /** Web Services ID for Sign in with Apple on the web (optional). */
  APPLE_SERVICES_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  /** Development only: return e-mail codes in responses instead of sending them. */
  AUTH_DEBUG_CODES?: string;
}

export const accountsEnabled = (env: ServerEnv): boolean => !!(env.DB && env.TOKEN_SECRET);
