import { describe, it, expect, vi } from "vitest";
import { WordpressClient } from "../../src/clients/wordpress.js";
import type { BlogDraft } from "@pa/shared-types";

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const DRAFT: BlogDraft = {
  headline: "Test post",
  urlSlug: "test-post",
  bodyMarkdown: "# Test\n\nBody.",
  metaDescription: "A test post meta description with enough detail to matter.",
  socialDescription: "Social blurb.",
  category: "Home",
  tags: ["cozy", "diy"],
  imageSlots: [],
};

describe("WordpressClient.createDraft", () => {
  it("resolves tags, finds category, and posts a draft with rankmath meta", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const u = new URL(url);
      if (u.pathname === "/wp-json/wp/v2/tags" && init.method === "GET") {
        return makeResponse(200, []);
      }
      if (u.pathname === "/wp-json/wp/v2/tags" && init.method === "POST") {
        const body = JSON.parse(init.body as string) as { name: string };
        return makeResponse(200, { id: body.name === "cozy" ? 10 : 11 });
      }
      if (u.pathname === "/wp-json/wp/v2/categories") {
        return makeResponse(200, [{ id: 99, name: "Home", slug: "home" }]);
      }
      if (u.pathname === "/wp-json/wp/v2/posts" && init.method === "POST") {
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        return makeResponse(200, {
          id: 123,
          link: "https://blog.example.com/?p=123",
          status: body.status as string,
        });
      }
      throw new Error(`unexpected call ${init.method} ${u.pathname}`);
    });

    const client = new WordpressClient({
      siteUrl: "https://blog.example.com",
      username: "admin",
      appPassword: "pw",
      seoPlugin: "rankmath",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.createDraft(DRAFT);

    expect(result.postId).toBe(123);
    expect(result.editUrl).toBe(
      "https://blog.example.com/wp-admin/post.php?post=123&action=edit",
    );

    const postCall = fetchImpl.mock.calls.find(([url, init]) => {
      return (url as string).endsWith("/wp-json/wp/v2/posts") && (init as RequestInit).method === "POST";
    });
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.status).toBe("draft");
    expect(body.categories).toEqual([99]);
    expect(body.tags).toEqual([10, 11]);
    expect((body.meta as Record<string, string>).rank_math_title).toBe(DRAFT.headline);
  });

  it("throws when not configured", async () => {
    const client = new WordpressClient({
      siteUrl: "",
      username: "",
      appPassword: "",
    });
    await expect(client.createDraft(DRAFT)).rejects.toThrow(/not configured/);
  });
});
