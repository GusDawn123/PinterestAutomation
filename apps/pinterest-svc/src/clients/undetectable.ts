import { z } from "zod";
import pLimit from "p-limit";
import type { HumanizeRequest, HumanizeResult } from "@pa/shared-types";
import { env } from "../env.js";
import { langfuse } from "../tracing.js";

const UNDETECTABLE_BASE = "https://humanize.undetectable.ai";

const SubmitResponseSchema = z.object({
  status: z.string().optional(),
  id: z.string(),
});

const DocumentResponseSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  output: z.string().nullable().optional(),
  input: z.string().optional(),
  error: z.string().nullable().optional(),
});

export interface UndetectableClientOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  maxConcurrent?: number;
}

export class UndetectableClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limit: ReturnType<typeof pLimit>;

  constructor(opts: UndetectableClientOptions = {}) {
    this.apiKey = opts.apiKey ?? env.UNDETECTABLE_API_KEY ?? "";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? 1500;
    this.timeoutMs = opts.timeoutMs ?? 180_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.limit = pLimit(opts.maxConcurrent ?? 3);
  }

  private ensureConfigured(): void {
    if (!this.apiKey) throw new Error("UNDETECTABLE_API_KEY not set");
  }

  async humanize(req: HumanizeRequest): Promise<HumanizeResult> {
    this.ensureConfigured();
    return this.limit(() => this.runOnce(req));
  }

  private async runOnce(req: HumanizeRequest): Promise<HumanizeResult> {
    const trace = langfuse?.trace({
      name: "humanize",
      input: { chars: req.text.length, readability: req.readability, purpose: req.purpose },
    });
    const span = trace?.span({ name: "undetectable.submit" });

    try {
      const submitRes = await this.fetchImpl(`${UNDETECTABLE_BASE}/submit`, {
        method: "POST",
        headers: {
          apikey: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: req.text,
          readability: req.readability,
          purpose: req.purpose,
          strength: "More Human",
          model: "v11",
        }),
      });

      if (!submitRes.ok) {
        throw new Error(`Undetectable submit failed: ${submitRes.status} ${await submitRes.text()}`);
      }

      const submitted = SubmitResponseSchema.parse(await submitRes.json());
      span?.end({ output: { id: submitted.id } });

      const pollSpan = trace?.span({ name: "undetectable.poll" });
      const start = Date.now();
      let attempts = 0;
      while (Date.now() - start < this.timeoutMs) {
        attempts += 1;
        await this.sleep(this.pollIntervalMs);
        const docRes = await this.fetchImpl(`${UNDETECTABLE_BASE}/document`, {
          method: "POST",
          headers: {
            apikey: this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: submitted.id }),
        });
        if (!docRes.ok) {
          throw new Error(`Undetectable document failed: ${docRes.status} ${await docRes.text()}`);
        }
        const doc = DocumentResponseSchema.parse(await docRes.json());
        if (doc.error) {
          throw new Error(`Undetectable error: ${doc.error}`);
        }
        if (doc.output) {
          pollSpan?.end({ output: { attempts } });
          trace?.update({ output: { chars: doc.output.length } });
          return { humanizedText: doc.output, documentId: doc.id };
        }
      }
      throw new Error(`Undetectable humanize timed out after ${this.timeoutMs}ms`);
    } catch (err) {
      span?.end({ level: "ERROR", statusMessage: (err as Error).message });
      trace?.update({ output: { error: (err as Error).message } });
      throw err;
    }
  }
}
