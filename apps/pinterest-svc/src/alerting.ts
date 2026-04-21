import { env } from "./env.js";
import { Sentry } from "./tracing.js";

export type AlertSeverity = "info" | "warn" | "error" | "critical";

export interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  workflowRunId?: string;
}

const SEVERITY_COLOR: Record<AlertSeverity, number> = {
  info: 0x3498db,
  warn: 0xf1c40f,
  error: 0xe67e22,
  critical: 0xe74c3c,
};

export interface Alerter {
  send(alert: Alert): Promise<void>;
}

export class CompositeAlerter implements Alerter {
  constructor(private readonly sinks: Alerter[]) {}
  async send(alert: Alert): Promise<void> {
    await Promise.allSettled(this.sinks.map((s) => s.send(alert)));
  }
}

export class DiscordWebhookAlerter implements Alerter {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(alert: Alert): Promise<void> {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
    if (alert.workflowRunId) {
      fields.push({ name: "Workflow run", value: alert.workflowRunId, inline: true });
    }
    if (alert.context) {
      for (const [k, v] of Object.entries(alert.context)) {
        fields.push({
          name: k,
          value: typeof v === "string" ? v.slice(0, 1024) : JSON.stringify(v).slice(0, 1024),
          inline: true,
        });
      }
    }

    const body = {
      embeds: [
        {
          title: `[${alert.severity.toUpperCase()}] ${alert.title}`,
          description: alert.message.slice(0, 4000),
          color: SEVERITY_COLOR[alert.severity],
          timestamp: new Date().toISOString(),
          fields: fields.slice(0, 25),
        },
      ],
    };

    const res = await this.fetchImpl(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Discord webhook failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
  }
}

export class SentryAlerter implements Alerter {
  async send(alert: Alert): Promise<void> {
    if (!env.SENTRY_DSN) return;
    const level: "info" | "warning" | "error" | "fatal" =
      alert.severity === "info"
        ? "info"
        : alert.severity === "warn"
          ? "warning"
          : alert.severity === "error"
            ? "error"
            : "fatal";
    Sentry.captureMessage(`${alert.title}: ${alert.message}`, {
      level,
      tags: { severity: alert.severity, workflowRunId: alert.workflowRunId ?? "none" },
      extra: alert.context,
    });
  }
}

export class NoopAlerter implements Alerter {
  async send(): Promise<void> {
    /* noop */
  }
}

export function buildAlerter(): Alerter {
  const sinks: Alerter[] = [];
  if (env.DISCORD_ALERT_WEBHOOK_URL) {
    sinks.push(new DiscordWebhookAlerter(env.DISCORD_ALERT_WEBHOOK_URL));
  }
  if (env.SENTRY_DSN) {
    sinks.push(new SentryAlerter());
  }
  return sinks.length > 0 ? new CompositeAlerter(sinks) : new NoopAlerter();
}
