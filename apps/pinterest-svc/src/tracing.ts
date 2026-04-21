import * as Sentry from "@sentry/node";
import { Langfuse } from "langfuse";
import { env } from "./env.js";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

export const langfuse =
  env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY
    ? new Langfuse({
        publicKey: env.LANGFUSE_PUBLIC_KEY,
        secretKey: env.LANGFUSE_SECRET_KEY,
        baseUrl: env.LANGFUSE_BASE_URL,
      })
    : null;

export { Sentry };

export async function flushTelemetry(): Promise<void> {
  await Promise.allSettled([
    langfuse?.flushAsync(),
    env.SENTRY_DSN ? Sentry.flush(2000) : Promise.resolve(),
  ]);
}
