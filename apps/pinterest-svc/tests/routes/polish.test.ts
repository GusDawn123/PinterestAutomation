import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";

let mock: MockCtx;
const app = await buildServer({ ctx: (mock = makeMockCtx()).ctx });

beforeEach(() => {
  mock.anthropic.analyzeImage.mockReset();
  mock.anthropic.pickInterlinks.mockReset();
  mock.undetectable.humanize.mockReset();
  mock.getImageAnalysisPrompt.mockResolvedValue("image analysis prompt");
  mock.getInterlinkPrompt.mockResolvedValue("interlink prompt");
});

afterAll(async () => {
  await app.close();
});

describe("POST /image-analysis", () => {
  it("passes prompt + body to Anthropic client", async () => {
    mock.anthropic.analyzeImage.mockResolvedValue({
      title: "Morning reading nook",
      altText: "A reading nook",
      detectedTags: ["linen", "morning light"],
      confidence: "high",
    });

    const res = await app.inject({
      method: "POST",
      url: "/image-analysis",
      payload: {
        imageUrl: "https://cdn.example.com/a.png",
        blogTitle: "Cozy ideas",
        primaryKeyword: "cozy",
        promptHint: "sunlit nook",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { title: string; altText: string };
    expect(body.title).toBe("Morning reading nook");
    expect(body.altText).toBe("A reading nook");
    expect(mock.anthropic.analyzeImage).toHaveBeenCalledWith(
      expect.objectContaining({ primaryKeyword: "cozy" }),
      "image analysis prompt",
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
