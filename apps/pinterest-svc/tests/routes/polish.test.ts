import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";

let mock: MockCtx;
const app = await buildServer({ ctx: (mock = makeMockCtx()).ctx });

beforeEach(() => {
  mock.anthropic.generateAltText.mockReset();
  mock.anthropic.pickInterlinks.mockReset();
  mock.undetectable.humanize.mockReset();
  mock.getAltTextPrompt.mockResolvedValue("alt text prompt");
  mock.getInterlinkPrompt.mockResolvedValue("interlink prompt");
});

afterAll(async () => {
  await app.close();
});

describe("POST /alt-text", () => {
  it("passes prompt + body to Anthropic client", async () => {
    mock.anthropic.generateAltText.mockResolvedValue({
      altText: "A reading nook",
      confidence: "high",
    });

    const res = await app.inject({
      method: "POST",
      url: "/alt-text",
      payload: {
        imageUrl: "https://cdn.example.com/a.png",
        blogTitle: "Cozy ideas",
        primaryKeyword: "cozy",
        promptHint: "sunlit nook",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { altText: string };
    expect(body.altText).toBe("A reading nook");
    expect(mock.anthropic.generateAltText).toHaveBeenCalledWith(
      expect.objectContaining({ primaryKeyword: "cozy" }),
      "alt text prompt",
    );
  });
});

describe("POST /interlinks", () => {
  it("returns selections from Anthropic", async () => {
    mock.anthropic.pickInterlinks.mockResolvedValue({
      selections: [
        {
          url: "https://blog.example.com/older",
          anchor: "cozy",
          sectionIndex: 1,
          reason: "overlap",
        },
      ],
    });

    const res = await app.inject({
      method: "POST",
      url: "/interlinks",
      payload: {
        draft: {
          headline: "h",
          urlSlug: "h",
          bodyMarkdown: "body",
          metaDescription: "m",
          socialDescription: "s",
          category: "Home",
          tags: [],
          imageSlots: [],
        },
        candidatePosts: [
          { url: "https://blog.example.com/older", title: "older", tags: ["cozy"] },
        ],
        maxLinks: 3,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { selections: unknown[] };
    expect(body.selections).toHaveLength(1);
  });
});

describe("POST /humanize", () => {
  it("rejects when HUMANIZE_ENABLED is false by default", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/humanize",
      payload: { text: "some text" },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toBe("humanize_disabled");
  });
});
