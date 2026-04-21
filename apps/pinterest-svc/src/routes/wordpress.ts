import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  WordpressDraftRequestSchema,
  type AffiliateProduct,
  type BlogDraft,
  type ChosenImage,
} from "@pa/shared-types";
import type { ServiceContext } from "../context.js";
import type { BlogDraftAffiliateSlot } from "../services/workflow.js";

const IdParam = z.object({ id: z.string().uuid() });

async function defaultDownload(url: string): Promise<{ data: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image download failed: ${res.status} ${url}`);
  const data = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/png";
  return { data, contentType };
}

export async function convertPngToJpeg(
  data: Buffer,
  contentType: string,
  quality = 82,
): Promise<{ data: Buffer; contentType: string }> {
  const shouldConvert = contentType === "image/png" || contentType === "image/webp";
  if (!shouldConvert) return { data, contentType };
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(data).jpeg({ quality, mozjpeg: true }).toBuffer();
  return { data: jpeg, contentType: "image/jpeg" };
}

function fileNameFor(slotPosition: number, contentType: string): string {
  const ext = contentType.includes("jpeg") ? "jpg" : contentType.split("/")[1] ?? "png";
  return `slot-${slotPosition}.${ext}`;
}

function injectImagesIntoBody(
  body: string,
  images: Array<{ slotPosition: number; sourceUrl: string; alt: string }>,
): string {
  let out = body;
  for (const img of images) {
    const marker = `{{IMAGE_${img.slotPosition}}}`;
    const mdImg = `![${img.alt.replace(/[\[\]]/g, "")}](${img.sourceUrl})`;
    if (out.includes(marker)) {
      out = out.split(marker).join(mdImg);
    }
  }
  return out;
}

export function renderAffiliateBlock(products: AffiliateProduct[]): string {
  if (products.length === 0) return "";
  const items = products
    .map((p) => p.rawHtml.trim())
    .filter((html) => html.length > 0)
    .join('\n<hr class="pa-affiliates-sep" />\n');
  if (items.length === 0) return "";
  return `\n\n<div class="pa-affiliates">\n${items}\n</div>\n`;
}

export function injectAffiliatesIntoBody(
  body: string,
  imageSourceUrls: Array<{ slotPosition: number; sourceUrl: string }>,
  affiliateSlots: BlogDraftAffiliateSlot[],
): string {
  if (affiliateSlots.length === 0) return body;
  let out = body;
  for (const slot of affiliateSlots) {
    const image = imageSourceUrls.find((i) => i.slotPosition === slot.slotPosition);
    if (!image) continue;
    const block = renderAffiliateBlock(slot.products);
    if (!block) continue;
    const needle = image.sourceUrl;
    const idx = out.indexOf(needle);
    if (idx === -1) continue;
    const after = out.indexOf(")", idx);
    if (after === -1) continue;
    const insertAt = after + 1;
    out = out.slice(0, insertAt) + block + out.slice(insertAt);
  }
  return out;
}

export async function wordpressRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.post("/wordpress/draft", async (req) => {
    const { draft } = WordpressDraftRequestSchema.parse(req.body);
    return ctx.wordpress.createDraft(draft);
  });

  app.post("/workflows/:id/wordpress-draft", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const draft = blogDraft.draft as BlogDraft;
    const chosen = (blogDraft.chosenImages as ChosenImage[] | null) ?? [];
    const affiliateSlots =
      (blogDraft.affiliateProducts as BlogDraftAffiliateSlot[] | null) ?? [];
    const download = ctx.downloadImage ?? defaultDownload;

    const uploaded: Array<{ slotPosition: number; mediaId: number; sourceUrl: string; alt: string }> = [];
    for (const image of chosen) {
      const raw = await download(image.imageUrl);
      const converted = await convertPngToJpeg(raw.data, raw.contentType);
      const extHint = converted.contentType === "image/jpeg" ? "jpg" : "png";
      const stripped = await ctx.exif.stripBuffer(converted.data, extHint);
      const alt = image.altText ?? draft.headline;
      const { mediaId, sourceUrl } = await ctx.wordpress.uploadMedia({
        data: stripped,
        filename: fileNameFor(image.slotPosition, converted.contentType),
        contentType: converted.contentType,
        altText: alt,
      });
      uploaded.push({ slotPosition: image.slotPosition, mediaId, sourceUrl, alt });
    }

    const bodyWithImages = injectImagesIntoBody(
      draft.bodyMarkdown,
      uploaded.map((u) => ({ slotPosition: u.slotPosition, sourceUrl: u.sourceUrl, alt: u.alt })),
    );
    const bodyWithAffiliates = injectAffiliatesIntoBody(
      bodyWithImages,
      uploaded.map((u) => ({ slotPosition: u.slotPosition, sourceUrl: u.sourceUrl })),
      affiliateSlots,
    );

    const draftWithImages: BlogDraft = {
      ...draft,
      bodyMarkdown: bodyWithAffiliates,
    };

    const featured = uploaded[0]?.mediaId;
    const wp = await ctx.wordpress.createDraft(
      draftWithImages,
      featured ? { featuredMediaId: featured } : {},
    );
    await ctx.workflow.updateBlogDraftWpId(blogDraft.id, String(wp.postId));
    await ctx.workflow.update(id, {
      currentStep: "wordpress_draft_created",
      status: "completed",
      finishedAt: new Date(),
    });

    return wp;
  });
}
