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

describe("AnthropicClient.generateAltText", () => {
  it("parses alt text JSON and passes image URL block", async () => {
    const fake = makeFakeAnthropic(
      JSON.stringify({ alt_text: "A green reading nook with sunlight.", confidence: "high" }),
    );
    const client = new AnthropicClient(fake, "claude-opus-4-7");

    const result = await client.generateAltText(
      {
        imageUrl: "https://cdn.example.com/x.png",
        blogTitle: "Cozy ideas",
        primaryKeyword: "cozy reading nook",
        promptHint: "sunlit reading nook with plants",
      },
      "you write alt text",
    );

    expect(result.altText).toBe("A green reading nook with sunlight.");
    expect(result.confidence).toBe("high");

    const createFn = fake.messages.create as unknown as ReturnType<typeof vi.fn>;
    const args = createFn.mock.calls[0]![0] as Parameters<typeof fake.messages.create>[0];
    const firstMessage = args.messages![0]!;
    expect(Array.isArray(firstMessage.content)).toBe(true);
    const blocks = firstMessage.content as Array<{ type: string; source?: { url?: string } }>;
    const imageBlock = blocks.find((b) => b.type === "image");
    expect(imageBlock?.source?.url).toBe("https://cdn.example.com/x.png");
  });
});

describe("AnthropicClient.generatePinCopy", () => {
  it("sends image block + user text, parses PinCopyResult", async () => {
    const fake = makeFakeAnthropic(
      JSON.stringify({
        variations: [
          { title: "Cozy reading nook ideas", description: "Warm, practical ideas for the perfect nook." },
          { title: "Tiny nook, big cozy", description: "Make a small corner feel like a hug." },
        ],
      }),
    );
    const client = new AnthropicClient(fake, "claude-opus-4-7");

    const result = await client.generatePinCopy(
      {
        blogHeadline: "Cozy nook ideas",
        blogUrl: "https://blog.example.com/cozy",
        primaryKeyword: "cozy reading nook",
        relatedKeywords: ["cozy", "nook"],
        imageUrl: "https://cdn.example.com/nook.png",
        imageAltText: "a window seat with plants",
        variationsPerImage: 3,
      },
      "pin copy system",
    );

    expect(result.imageUrl).toBe("https://cdn.example.com/nook.png");
    expect(result.variations).toHaveLength(2);
    expect(result.variations[0]!.title).toBe("Cozy reading nook ideas");

    const createFn = fake.messages.create as unknown as ReturnType<typeof vi.fn>;
    const args = createFn.mock.calls[0]![0] as Parameters<typeof fake.messages.create>[0];
    const firstMessage = args.messages![0]!;
    const blocks = firstMessage.content as Array<{ type: string; source?: { url?: string }; text?: string }>;
    const imageBlock = blocks.find((b) => b.type === "image");
    expect(imageBlock?.source?.url).toBe("https://cdn.example.com/nook.png");
    const textBlock = blocks.find((b) => b.type === "text");
    expect(textBlock?.text).toContain("blog_headline: Cozy nook ideas");
    expect(textBlock?.text).toContain("variations_per_image: 3");
  });

  it("rejects when variation count is zero", async () => {
    const fake = makeFakeAnthropic(JSON.stringify({ variations: [] }));
    const client = new AnthropicClient(fake, "claude-opus-4-7");
    await expect(
      client.generatePinCopy(
        {
          blogHeadline: "h",
          blogUrl: "https://x.example.com/",
          primaryKeyword: "k",
          relatedKeywords: [],
          imageUrl: "https://x.example.com/img.png",
          variationsPerImage: 3,
        },
        "sys",
      ),
    ).rejects.toThrow();
  });
});

describe("AnthropicClient.pickInterlinks", () => {
  it("normalizes section_index into sectionIndex", async () => {
    const fake = makeFakeAnthropic(
      JSON.stringify({
        selections: [
          {
            url: "https://blog.example.com/older",
            anchor: "cozy diy",
            section_index: 2,
            reason: "overlaps on cozy",
          },
        ],
      }),
    );
    const client = new AnthropicClient(fake, "claude-opus-4-7");

    const result = await client.pickInterlinks(
      {
        draft: {
          headline: "x",
          urlSlug: "x",
          bodyMarkdown: "body",
          metaDescription: "m",
          socialDescription: "s",
          category: "Home",
          tags: ["cozy"],
          imageSlots: [],
        },
        candidatePosts: [
          {
            url: "https://blog.example.com/older",
            title: "older post",
            tags: ["cozy"],
          },
        ],
        maxLinks: 3,
      },
      "interlink system",
    );

    expect(result.selections).toHaveLength(1);
    expect(result.selections[0]!.sectionIndex).toBe(2);
    expect(result.selections[0]!.url).toBe("https://blog.example.com/older");
  });
});
