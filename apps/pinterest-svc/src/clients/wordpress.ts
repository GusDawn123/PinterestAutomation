import { z } from "zod";
import type { BlogDraft, WordpressDraftResponse } from "@pa/shared-types";
import { env } from "../env.js";

const WpPostResponseSchema = z.object({
  id: z.number().int().positive(),
  link: z.string().url(),
  status: z.string(),
});

const WpCategoryResponseSchema = z.array(
  z.object({ id: z.number().int(), name: z.string(), slug: z.string() }),
);

const WpTagResponseSchema = z.array(
  z.object({ id: z.number().int(), name: z.string(), slug: z.string() }),
);

export interface WordpressClientOptions {
  siteUrl?: string;
  username?: string;
  appPassword?: string;
  seoPlugin?: "rankmath" | "yoast";
  fetchImpl?: typeof fetch;
}

export class WordpressClient {
  private readonly siteUrl: string;
  private readonly username: string;
  private readonly appPassword: string;
  private readonly seoPlugin: "rankmath" | "yoast";
  private readonly fetchImpl: typeof fetch;

  constructor(opts: WordpressClientOptions = {}) {
    this.siteUrl = (opts.siteUrl ?? env.WORDPRESS_SITE_URL ?? "").replace(/\/$/, "");
    this.username = opts.username ?? env.WORDPRESS_USERNAME ?? "";
    this.appPassword = opts.appPassword ?? env.WORDPRESS_APP_PASSWORD ?? "";
    this.seoPlugin = opts.seoPlugin ?? env.WORDPRESS_SEO_PLUGIN;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private authHeader(): string {
    if (!this.siteUrl || !this.username || !this.appPassword) {
      throw new Error(
        "WordPress client not configured — set WORDPRESS_SITE_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD",
      );
    }
    const b64 = Buffer.from(`${this.username}:${this.appPassword}`).toString("base64");
    return `Basic ${b64}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    schema?: z.ZodType<T>,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.siteUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`WP ${method} ${path} failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    return schema ? schema.parse(json) : (json as T);
  }

  async upsertTagsByName(names: string[]): Promise<number[]> {
    if (names.length === 0) return [];
    const results: number[] = [];
    for (const name of names) {
      const q = encodeURIComponent(name);
      const existing = await this.request(
        "GET",
        `/wp-json/wp/v2/tags?search=${q}&per_page=5`,
        undefined,
        WpTagResponseSchema,
      );
      const match = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (match) {
        results.push(match.id);
        continue;
      }
      const created = await this.request(
        "POST",
        "/wp-json/wp/v2/tags",
        { name },
        z.object({ id: z.number().int() }),
      );
      results.push(created.id);
    }
    return results;
  }

  async findCategoryByName(name: string): Promise<number | null> {
    const q = encodeURIComponent(name);
    const categories = await this.request(
      "GET",
      `/wp-json/wp/v2/categories?search=${q}&per_page=5`,
      undefined,
      WpCategoryResponseSchema,
    );
    const match = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return match?.id ?? null;
  }

  async createDraft(draft: BlogDraft): Promise<WordpressDraftResponse> {
    const [tagIds, categoryId] = await Promise.all([
      this.upsertTagsByName(draft.tags),
      this.findCategoryByName(draft.category),
    ]);

    const meta = this.seoPlugin === "rankmath"
      ? {
          rank_math_title: draft.headline,
          rank_math_description: draft.metaDescription,
          rank_math_focus_keyword: draft.tags[0] ?? "",
          rank_math_facebook_description: draft.socialDescription,
        }
      : {
          yoast_wpseo_title: draft.headline,
          yoast_wpseo_metadesc: draft.metaDescription,
          yoast_wpseo_focuskw: draft.tags[0] ?? "",
        };

    const payload = {
      title: draft.headline,
      slug: draft.urlSlug,
      content: draft.bodyMarkdown,
      excerpt: draft.metaDescription,
      status: "draft" as const,
      ...(categoryId ? { categories: [categoryId] } : {}),
      tags: tagIds,
      meta,
    };

    const created = await this.request(
      "POST",
      "/wp-json/wp/v2/posts",
      payload,
      WpPostResponseSchema,
    );

    return {
      postId: created.id,
      editUrl: `${this.siteUrl}/wp-admin/post.php?post=${created.id}&action=edit`,
      previewUrl: created.link,
    };
  }
}
