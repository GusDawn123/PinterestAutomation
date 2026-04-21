import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";
import {
  injectAffiliatesIntoBody,
  renderAffiliateBlock,
} from "../../src/routes/wordpress.js";
import type { BlogDraft, ChosenImage } from "@pa/shared-types";

let mock: MockCtx;
const app = await buildServer({ ctx: (mock = makeMockCtx()).ctx });

beforeEach(() => {
  mock.workflow.get.mockReset();
  mock.workflow.getBlogDraftByRun.mockReset();
  mock.workflow.updateBlogDraftWpId.mockReset();
  mock.workflow.update.mockReset();
  mock.wordpress.createDraft.mockReset();
  mock.wordpress.uploadMedia.mockReset();
  mock.downloadImage.mockReset();
});

afterAll(async () => {
  await app.close();
});

describe("renderAffiliateBlock", () => {
  it("returns empty string when no products", () => {
    expect(renderAffiliateBlock([])).toBe("");
  });

  it("returns empty string when all products have empty HTML", () => {
    expect(
      renderAffiliateBlock([
        { retailer: "amazon", rawHtml: "   " },
        { retailer: "target", rawHtml: "" },
      ]),
    ).toBe("");
  });

  it("wraps products in pa-affiliates container separated by hr", () => {
    const html = renderAffiliateBlock([
      { retailer: "amazon", rawHtml: "<a>amazon</a>" },
      { retailer: "target", rawHtml: "<a>target</a>" },
    ]);
    expect(html).toContain('class="pa-affiliates"');
    expect(html).toContain("<a>amazon</a>");
    expect(html).toContain("<a>target</a>");
    expect(html).toContain('class="pa-affiliates-sep"');
  });
});

describe("injectAffiliatesIntoBody", () => {
  it("is a no-op when affiliate slots is empty", () => {
    const body = "![alt](https://wp.example.com/a.jpg)";
    expect(injectAffiliatesIntoBody(body, [{ slotPosition: 0, sourceUrl: "https://wp.example.com/a.jpg" }], [])).toBe(body);
  });

  it("inserts block directly after the matching image markdown", () => {
    const body = "intro\n\n![a](https://wp.example.com/a.jpg)\n\nmore text\n\n![b](https://wp.example.com/b.jpg)\n\nend";
    const out = injectAffiliatesIntoBody(
      body,
      [
        { slotPosition: 0, sourceUrl: "https://wp.example.com/a.jpg" },
        { slotPosition: 1, sourceUrl: "https://wp.example.com/b.jpg" },
      ],
      [
        { slotPosition: 0, products: [{ retailer: "amazon", rawHtml: "<p>amazon-0</p>" }] },
        { slotPosition: 1, products: [{ retailer: "target", rawHtml: "<p>target-1</p>" }] },
      ],
    );
    const aEnd = out.indexOf("https://wp.example.com/a.jpg)");
    const amazonPos = out.indexOf("amazon-0");
    const moreTextPos = out.indexOf("more text");
    expect(aEnd).toBeGreaterThan(-1);
    expect(amazonPos).toBeGreaterThan(aEnd);
    expect(amazonPos).toBeLessThan(moreTextPos);

    const bEnd = out.indexOf("https://wp.example.com/b.jpg)");
    const targetPos = out.indexOf("target-1");
    expect(targetPos).toBeGreaterThan(bEnd);
  });

  it("skips slots with no matching image source URL", () => {
    const body = "![a](https://wp.example.com/a.jpg)";
    const out = injectAffiliatesIntoBody(
      body,
      [{ slotPosition: 0, sourceUrl: "https://wp.example.com/a.jpg" }],
      [{ slotPosition: 9, products: [{ retailer: "amazon", rawHtml: "<p>ignored</p>" }] }],
    );
    expect(out).toBe(body);
  });
});

describe("POST /workflows/:id/wordpress-draft end-to-end with affiliates", () => {
  const runId = "00000000-0000-4000-8000-000000000d10";
  const draftId = "00000000-0000-4000-8000-000000000d11";

  const DRAFT: BlogDraft = {
    headline: "Cozy",
    urlSlug: "cozy",
    bodyMarkdown: "intro\n\n{{IMAGE_0}}\n\nbody\n\n{{IMAGE_1}}",
    metaDescription: "m",
    socialDescription: "s",
    category: "Home",
    tags: ["cozy"],
    imageSlots: [
      { position: 0, promptHint: "a" },
      { position: 1, promptHint: "b" },
    ],
  };

  it("injects affiliate block directly below each image in the post body", async () => {
    const chosen: ChosenImage[] = [
      { slotPosition: 0, imageUrl: "https://cdn.ideogram.ai/a.png", prompt: "a", altText: "alt a" },
      { slotPosition: 1, imageUrl: "https://cdn.ideogram.ai/b.png", prompt: "b" },
    ];

    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      draft: DRAFT,
      chosenImages: chosen,
      affiliateProducts: [
        {
          slotPosition: 0,
          products: [
            { retailer: "amazon", rawHtml: "<div>AMZ-0</div>" },
            { retailer: "target", rawHtml: "<div>TGT-0</div>" },
          ],
        },
        {
          slotPosition: 1,
          products: [{ retailer: "lowes", rawHtml: "<div>LOW-1</div>" }],
        },
      ],
    } as never);
    mock.downloadImage.mockImplementation(async (url: string) => ({
      data: Buffer.from(url),
      contentType: "image/jpeg",
    }));
    mock.wordpress.uploadMedia
      .mockResolvedValueOnce({ mediaId: 501, sourceUrl: "https://wp.example.com/a.jpg" })
      .mockResolvedValueOnce({ mediaId: 502, sourceUrl: "https://wp.example.com/b.jpg" });
    mock.wordpress.createDraft.mockResolvedValue({
      postId: 123,
      editUrl: "https://wp.example.com/edit",
      previewUrl: "https://wp.example.com/preview",
    });
    mock.workflow.updateBlogDraftWpId.mockResolvedValue({} as never);
    mock.workflow.update.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/wordpress-draft`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const [draftArg] = mock.wordpress.createDraft.mock.calls[0]!;
    const md = (draftArg as BlogDraft).bodyMarkdown;

    const aImgPos = md.indexOf("https://wp.example.com/a.jpg)");
    const amzPos = md.indexOf("AMZ-0");
    const tgtPos = md.indexOf("TGT-0");
    const bodyPos = md.indexOf("body");
    expect(aImgPos).toBeGreaterThan(-1);
    expect(amzPos).toBeGreaterThan(aImgPos);
    expect(tgtPos).toBeGreaterThan(amzPos);
    expect(amzPos).toBeLessThan(bodyPos);

    const bImgPos = md.indexOf("https://wp.example.com/b.jpg)");
    const lowPos = md.indexOf("LOW-1");
    expect(lowPos).toBeGreaterThan(bImgPos);
  });

  it("is a no-op when affiliateProducts is null", async () => {
    const chosen: ChosenImage[] = [
      { slotPosition: 0, imageUrl: "https://cdn.ideogram.ai/a.png", prompt: "a" },
    ];
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      draft: DRAFT,
      chosenImages: chosen,
      affiliateProducts: null,
    } as never);
    mock.downloadImage.mockResolvedValue({
      data: Buffer.from([1]),
      contentType: "image/jpeg",
    });
    mock.wordpress.uploadMedia.mockResolvedValue({
      mediaId: 601,
      sourceUrl: "https://wp.example.com/c.jpg",
    });
    mock.wordpress.createDraft.mockResolvedValue({
      postId: 321,
      editUrl: "https://wp.example.com/edit",
      previewUrl: "https://wp.example.com/preview",
    });
    mock.workflow.updateBlogDraftWpId.mockResolvedValue({} as never);
    mock.workflow.update.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/wordpress-draft`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const [draftArg] = mock.wordpress.createDraft.mock.calls[0]!;
    const md = (draftArg as BlogDraft).bodyMarkdown;
    expect(md).not.toContain("pa-affiliates");
  });
});
