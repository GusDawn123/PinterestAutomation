import { describe, it, expect, vi } from "vitest";
import { UndetectableClient } from "../../src/clients/undetectable.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("UndetectableClient.humanize", () => {
  it("submits, polls until output is ready, returns humanized text", async () => {
    const states = [
      jsonResponse(200, { id: "doc-1", status: "submitted" }),
      jsonResponse(200, { id: "doc-1", status: "processing", output: null }),
      jsonResponse(200, { id: "doc-1", status: "processing", output: null }),
      jsonResponse(200, { id: "doc-1", status: "done", output: "human text" }),
    ];
    const fetchImpl = vi.fn(async () => states.shift()!);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const client = new UndetectableClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollIntervalMs: 10,
      timeoutMs: 10_000,
      sleep,
    });

    const result = await client.humanize({
      text: "some text",
      readability: "high_school",
      purpose: "blog",
    });

    expect(result.humanizedText).toBe("human text");
    expect(result.documentId).toBe("doc-1");

    const submitInit = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(String(fetchImpl.mock.calls[0]![0])).toBe("https://humanize.undetectable.ai/submit");
    expect(submitInit.headers).toMatchObject({ apikey: "k" });
    expect(String(fetchImpl.mock.calls[1]![0])).toBe("https://humanize.undetectable.ai/document");
    expect(sleep).toHaveBeenCalled();
  });

  it("propagates API error from document", async () => {
    const states = [
      jsonResponse(200, { id: "doc-2" }),
      jsonResponse(200, { id: "doc-2", error: "too long" }),
    ];
    const fetchImpl = vi.fn(async () => states.shift()!);
    const client = new UndetectableClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollIntervalMs: 1,
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await expect(
      client.humanize({ text: "x", readability: "high_school", purpose: "blog" }),
    ).rejects.toThrow(/too long/);
  });

  it("times out when polling exceeds limit", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      if (String(_url).endsWith("/submit")) {
        return jsonResponse(200, { id: "doc-3" });
      }
      return jsonResponse(200, { id: "doc-3", status: "processing", output: null });
    });
    const client = new UndetectableClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollIntervalMs: 1,
      timeoutMs: 5,
      sleep: vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 3))),
    });
    await expect(
      client.humanize({ text: "x", readability: "high_school", purpose: "blog" }),
    ).rejects.toThrow(/timed out/);
  });
});
