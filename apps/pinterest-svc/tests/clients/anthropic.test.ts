import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicClient, extractJson } from "../../src/clients/anthropic.js";
import type { BlogDraft } from "@pa/shared-types";

function makeFakeAnthropic(responseText: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
        usage: {
          input_tokens: 100,
          output_tokens: 200,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 50,
        },
      }),
    },
  } as unknown as Anthropic;
}

const SAMPLE_DRAFT: BlogDraft = {
  headline: "Cozy living room ideas for small apartments",
  urlSlug: "cozy-living-room-small-apartments",
  bodyMarkdown: "Intro paragraph.\n\n## First section\n\nContent here.",
  metaDescription:
    "Warm, practical cozy living room ideas for small apartments that feel like a real hug — no filler.",
  socialDescription: "Turn your tiny living room into the coziest spot in the building.",
  category: "Home",
  tags: ["cozy", "small apartment", "living room"],
  imageSlots: [{ position: 0, promptHint: "sunlit reading nook" }],
};

describe("extractJson", () => {
  it("parses raw JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON inside fenced code block", () => {
    expect(extractJson("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it("extracts first/last brace fallback", () => {
    expect(extractJson("preamble {\"a\":1} trailing")).toEqual({ a: 1 });
  });

  it("throws on no JSON", () => {
    expect(() => extractJson("no json here")).toThrow(/No JSON/);
  });
});

describe("AnthropicClient.generateBlogDraft", () => {
  it("sends cached system prompt and parses BlogDraft JSON", async () => {
    const fake = makeFakeAnthropic(JSON.stringify(SAMPLE_DRAFT));
    const client = new AnthropicClient(fake, "claude-opus-4-7");

    const draft = await client.generateBlogDraft(
      { keyword: "cozy living room", brief: "small apartments, warm tones" },
      "you are a blog writer",
    );

    expect(draft).toEqual(SAMPLE_DRAFT);
    const createFn = fake.messages.create as unknown as ReturnType<typeof vi.fn>;
    const args = createFn.mock.calls[0]![0] as Parameters<typeof fake.messages.create>[0];
    expect(args.model).toBe("claude-opus-4-7");
    expect(Array.isArray(args.system)).toBe(true);
    expect((args.system as Array<{ cache_control?: unknown }>)[0]!.cache_control).toEqual({
      type: "ephemeral",
    });
  });

  it("throws if Claude returns invalid JSON", async () => {
    const fake = makeFakeAnthropic("this is definitely not json");
    const client = new AnthropicClient(fake, "claude-opus-4-7");
    await expect(
      client.generateBlogDraft({ keyword: "x", brief: "y" }, "sys"),
    ).rejects.toThrow();
  });
});
