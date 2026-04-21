import { describe, it, expect, vi } from "vitest";
import {
  CompositeAlerter,
  DiscordWebhookAlerter,
  NoopAlerter,
  type Alert,
  type Alerter,
} from "../src/alerting.js";

describe("DiscordWebhookAlerter", () => {
  it("POSTs an embed with severity color + fields", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const alerter = new DiscordWebhookAlerter(
      "https://discord.com/api/webhooks/x/y",
      fetchImpl as unknown as typeof fetch,
    );

    await alerter.send({
      severity: "critical",
      title: "Pinterest pin post failing",
      message: "401 unauthorized",
      workflowRunId: "wr-123",
      context: { boardId: "board-1", attempts: 5 },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://discord.com/api/webhooks/x/y");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string) as {
      embeds: Array<{
        title: string;
        description: string;
        color: number;
        fields: Array<{ name: string; value: string }>;
      }>;
    };
    const embed = body.embeds[0]!;
    expect(embed.title).toContain("CRITICAL");
    expect(embed.title).toContain("Pinterest pin post failing");
    expect(embed.description).toBe("401 unauthorized");
    expect(embed.color).toBe(0xe74c3c);
    const fieldNames = embed.fields.map((f) => f.name);
    expect(fieldNames).toContain("Workflow run");
    expect(fieldNames).toContain("boardId");
    expect(fieldNames).toContain("attempts");
  });

  it("throws when Discord returns non-2xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    const alerter = new DiscordWebhookAlerter(
      "https://x",
      fetchImpl as unknown as typeof fetch,
    );
    await expect(
      alerter.send({ severity: "error", title: "t", message: "m" }),
    ).rejects.toThrow(/429/);
  });
});

describe("CompositeAlerter", () => {
  it("fans out to all sinks, swallows one sink's failure", async () => {
    const good: Alerter = { send: vi.fn().mockResolvedValue(undefined) };
    const bad: Alerter = { send: vi.fn().mockRejectedValue(new Error("boom")) };
    const composite = new CompositeAlerter([good, bad]);
    const alert: Alert = { severity: "warn", title: "t", message: "m" };

    await expect(composite.send(alert)).resolves.toBeUndefined();
    expect(good.send).toHaveBeenCalledWith(alert);
    expect(bad.send).toHaveBeenCalledWith(alert);
  });
});

describe("NoopAlerter", () => {
  it("does nothing without error", async () => {
    const alerter = new NoopAlerter();
    await expect(
      alerter.send({ severity: "info", title: "t", message: "m" }),
    ).resolves.toBeUndefined();
  });
});
