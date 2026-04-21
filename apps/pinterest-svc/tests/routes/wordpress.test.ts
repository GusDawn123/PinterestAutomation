import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";
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

describe("POST /workflows/:id/wordpress-draft with chosen images", () => {
  const runId = "00000000-0000-4000-8000-000000000d00";
  const draftId = "00000000-0000-4000-8000-000000000d01";

  it("uploads each chosen image, injects into body, sets first as featured", async () => {
    const chosen: ChosenImage[] = [
      {
        slotPosition: 0,
        imageUrl: "https://cdn.ideogram.ai/a.png",
        prompt: "a",
        altText: "alt a",
      },
      {
        slotPosition: 1,
        imageUrl: "https://cdn.ideogram.ai/b.png",
        prompt: "b",
      },
    ];

    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      draft: DRAFT,
      chosenImages: chosen,
    } as never);
    mock.downloadImage.mockImplementation(async (url: string) => ({
      data: Buffer.from(url),
      contentType: "image/jpeg",
    }));
    mock.wordpress.uploadMedia
      .mockResolvedValueOnce({ mediaId: 501, sourceUrl: "https://wp.example.com/a.png" })
      .mockResolvedValueOnce({ mediaId: 502, sourceUrl: "https://wp.example.com/b.png" });
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

    expect(mock.wordpress.uploadMedia).toHaveBeenCalledTimes(2);
    const [, wpExtras] = mock.wordpress.createDraft.mock.calls[0]!;
    expect(wpExtras).toEqual({ featuredMediaId: 501 });

    const [draftArg] = mock.wordpress.createDraft.mock.calls[0]!;
    const draftMd = (draftArg as BlogDraft).bodyMarkdown;
    expect(draftMd).toContain("https://wp.example.com/a.png");
    expect(draftMd).toContain("https://wp.example.com/b.png");
    expect(draftMd).not.toContain("{{IMAGE_0}}");
  });

  it("falls back to publishing without media when no chosen images", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      draft: DRAFT,
      chosenImages: null,
    } as never);
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
    expect(mock.wordpress.uploadMedia).not.toHaveBeenCalled();
    const [, wpExtras] = mock.wordpress.createDraft.mock.calls[0]!;
    expect(wpExtras).toEqual({});
  });
});
