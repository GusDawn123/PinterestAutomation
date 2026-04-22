import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PINTEREST_SVC_PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url(),

  PINTEREST_CLIENT_ID: z.string().optional(),
  PINTEREST_CLIENT_SECRET: z.string().optional(),
  PINTEREST_REFRESH_TOKEN: z.string().optional(),

  WORDPRESS_SITE_URL: z.string().url().optional(),
  WORDPRESS_USERNAME: z.string().optional(),
  WORDPRESS_APP_PASSWORD: z.string().optional(),
  WORDPRESS_SEO_PLUGIN: z.enum(["rankmath", "yoast"]).default("rankmath"),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_PRIMARY: z.string().default("claude-opus-4-7"),
  ANTHROPIC_MODEL_FALLBACK: z.string().default("claude-sonnet-4-6"),

  UNDETECTABLE_API_KEY: z.string().optional(),
  HUMANIZE_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  STRIP_EXIF: z
    .string()
    .transform((v) => v === "true")
    .default("true"),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default("pinterest-automation"),
  R2_PUBLIC_URL: z.string().url().optional(),

  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().default("http://localhost:3100"),

  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default("development"),

  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_ALERT_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_APPROVAL_CHANNEL_ID: z.string().optional(),

  PINTEREST_SVC_INTERNAL_TOKEN: z.string().default("change_me_shared_secret"),

  SCHEDULER_AUTO_POST: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
