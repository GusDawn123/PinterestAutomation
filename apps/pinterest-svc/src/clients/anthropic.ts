import Anthropic from "@anthropic-ai/sdk";
import {
  AffiliateQueriesResultSchema,
  AltTextResultSchema,
  BlogDraftSchema,
  InterlinkResultSchema,
  PinCopyResultSchema,
  type AffiliateQueriesResult,
  type AltTextRequest,
  type AltTextResult,
  type BlogDraft,
  type InterlinkRequest,
  type InterlinkResult,
  type PinCopyRequest,
  type PinCopyResult,
} from "@pa/shared-types";
import { env } from "../env.js";
import { langfuse } from "../tracing.js";

export interface BlogDraftInput {
  keyword: string;
  brief: string;
  relatedKeywords?: string[];
  siteStyle?: string;
  targetWordCount?: number;
}

export interface BlogDraftDeps {
  systemPrompt: string;
  client?: Anthropic;
  model?: string;
}

export class AnthropicClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(client?: Anthropic, model?: string) {
    if (!env.ANTHROPIC_API_KEY && !client) {
      throw new Error("ANTHROPIC_API_KEY not set");
    }
    this.client = client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    this.model = model ?? env.ANTHROPIC_MODEL_PRIMARY;
  }

  async generateBlogDraft(input: BlogDraftInput, systemPrompt: string): Promise<BlogDraft> {
    const trace = langfuse?.trace({
      name: "blog_draft",
      input: { keyword: input.keyword, brief: input.brief.slice(0, 200) },
    });
    const generation = trace?.generation({
      name: "claude.messages.create",
      model: this.model,
      input: { systemPrompt, userInput: input },
    });

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: renderUserPrompt(input),
          },
        ],
      });

      const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock) throw new Error("Claude returned no text block");

      const json = extractJson(textBlock.text);
      const draft = BlogDraftSchema.parse(json);

      generation?.end({
        output: { headline: draft.headline, wordCount: draft.bodyMarkdown.split(/\s+/).length },
        usage: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
        },
        metadata: {
          cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
        },
      });
      trace?.update({ output: { headline: draft.headline } });

      return draft;
    } catch (err) {
      generation?.end({ level: "ERROR", statusMessage: (err as Error).message });
      trace?.update({ output: { error: (err as Error).message } });
      throw err;
    }
  }

  async generateAltText(input: AltTextRequest, systemPrompt: string): Promise<AltTextResult> {
    const trace = langfuse?.trace({ name: "alt_text", input: { imageUrl: input.imageUrl } });
    const generation = trace?.generation({
      name: "claude.messages.create",
      model: this.model,
      input: { systemPrompt, userInput: input },
    });

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: input.imageUrl } },
              {
                type: "text",
                text: [
                  `blog_title: ${input.blogTitle}`,
                  `primary_keyword: ${input.primaryKeyword}`,
                  `prompt_hint: ${input.promptHint}`,
                  "",
                  "Return only the JSON object.",
                ].join("\n"),
              },
            ],
          },
        ],
      });

      const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock) throw new Error("Claude returned no text block");

      const json = extractJson(textBlock.text) as Record<string, unknown>;
      const result = AltTextResultSchema.parse({
        altText: json.alt_text ?? json.altText,
        confidence: json.confidence,
        notes: json.notes,
      });

      generation?.end({
        output: { confidence: result.confidence },
        usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
      });
      trace?.update({ output: { confidence: result.confidence } });
      return result;
    } catch (err) {
      generation?.end({ level: "ERROR", statusMessage: (err as Error).message });
      trace?.update({ output: { error: (err as Error).message } });
      throw err;
    }
  }

  async generatePinCopy(input: PinCopyRequest, systemPrompt: string): Promise<PinCopyResult> {
    const trace = langfuse?.trace({
      name: "pin_copy",
      input: { blogHeadline: input.blogHeadline, imageUrl: input.imageUrl },
    });
    const generation = trace?.generation({
      name: "claude.messages.create",
      model: this.model,
      input: { systemPrompt, userInput: { ...input, imageUrl: "(redacted)" } },
    });

    try {
      const userText = [
        `blog_headline: ${input.blogHeadline}`,
        `blog_url: ${input.blogUrl}`,
        `primary_keyword: ${input.primaryKeyword}`,
        `related_keywords: ${input.relatedKeywords.join(", ") || "(none)"}`,
        `image_alt_text: ${input.imageAltText ?? "(none)"}`,
        `variations_per_image: ${input.variationsPerImage}`,
        "",
        "Return only a single JSON object { imageUrl, variations: [{ title, description }, ...] }.",
      ].join("\n");

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: input.imageUrl } },
              { type: "text", text: userText },
            ],
          },
        ],
      });

      const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock) throw new Error("Claude returned no text block");

      const json = extractJson(textBlock.text) as Record<string, unknown>;
      const variationsRaw = Array.isArray(json.variations) ? json.variations : [];
      const result = PinCopyResultSchema.parse({
        imageUrl: json.imageUrl ?? json.image_url ?? input.imageUrl,
        variations: variationsRaw.map((raw) => {
          const v = raw as Record<string, unknown>;
          return { title: v.title, description: v.description };
        }),
      });

      generation?.end({
        output: { count: result.variations.length },
        usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
      });
      trace?.update({ output: { count: result.variations.length } });
      return result;
    } catch (err) {
      generation?.end({ level: "ERROR", statusMessage: (err as Error).message });
      trace?.update({ output: { error: (err as Error).message } });
      throw err;
    }
  }

  async suggestAffiliateQueries(
    input: { imageUrl: string; blogHeadline: string; primaryKeyword: string; altText?: string },
    systemPrompt: string,
  ): Promise<AffiliateQueriesResult> {
    const trace = langfuse?.trace({
      name: "affiliate_queries",
      input: { imageUrl: input.imageUrl, blogHeadline: input.blogHeadline },
    });
    const generation = trace?.generation({
      name: "claude.messages.create",
      model: this.model,
      input: { systemPrompt, userInput: { ...input, imageUrl: "(redacted)" } },
    });

    try {
      const userText = [
        `blog_headline: ${input.blogHeadline}`,
        `primary_keyword: ${input.primaryKeyword}`,
        `image_alt_text: ${input.altText ?? "(none)"}`,
        "",
        "Return only a single JSON object { queries: [string, ...] } with 3-5 concrete shoppable",
        "product descriptors visible in the image. Do NOT include retailer names. Prefer nouns a",
        "shopper would type (e.g. 'woven boho floor cushion', 'brass candle holder set of 3').",
      ].join("\n");

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: input.imageUrl } },
              { type: "text", text: userText },
            ],
          },
        ],
      });

      const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock) throw new Error("Claude returned no text block");

      const json = extractJson(textBlock.text) as Record<string, unknown>;
      const queriesRaw = Array.isArray(json.queries) ? json.queries : [];
      const result = AffiliateQueriesResultSchema.parse({
        queries: queriesRaw.map((q) => String(q).trim()).filter((q) => q.length > 0),
      });

      generation?.end({
        output: { count: result.queries.length },
        usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
      });
      trace?.update({ output: { count: result.queries.length } });
      return result;
    } catch (err) {
      generation?.end({ level: "ERROR", statusMessage: (err as Error).message });
      trace?.update({ output: { error: (err as Error).message } });
      throw err;
    }
  }

  async pickInterlinks(input: InterlinkRequest, systemPrompt: string): Promise<InterlinkResult> {
    const trace = langfuse?.trace({
      name: "interlink_picker",
      input: {
        headline: input.draft.headline,
        candidateCount: input.candidatePosts.length,
        maxLinks: input.maxLinks,
      },
    });
    const generation = trace?.generation({
      name: "claude.messages.create",
      model: this.model,
      input: { systemPrompt, candidateCount: input.candidatePosts.length },
    });

    try {
      const userText = [
        `max_links: ${input.maxLinks}`,
        `new_draft: ${JSON.stringify(input.draft)}`,
        `candidate_posts: ${JSON.stringify(input.candidatePosts)}`,
        "",
        "Return only the JSON object.",
      ].join("\n");

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userText }],
      });

      const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock) throw new Error("Claude returned no text block");

      const json = extractJson(textBlock.text) as Record<string, unknown>;
      const selectionsRaw = Array.isArray(json.selections) ? json.selections : [];
      const normalized = {
        selections: selectionsRaw.map((raw) => {
          const s = raw as Record<string, unknown>;
          return {
            url: s.url,
            anchor: s.anchor,
            sectionIndex: s.section_index ?? s.sectionIndex,
            reason: s.reason,
          };
        }),
      };
      const result = InterlinkResultSchema.parse(normalized);

      generation?.end({
        output: { count: result.selections.length },
        usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
      });
      trace?.update({ output: { count: result.selections.length } });
      return result;
    } catch (err) {
      generation?.end({ level: "ERROR", statusMessage: (err as Error).message });
      trace?.update({ output: { error: (err as Error).message } });
      throw err;
    }
  }
}

function renderUserPrompt(input: BlogDraftInput): string {
  return [
    `primary_keyword: ${input.keyword}`,
    `brief: ${input.brief}`,
    input.relatedKeywords?.length
      ? `secondary_keywords: ${input.relatedKeywords.join(", ")}`
      : "secondary_keywords: (none provided)",
    `target_word_count: ${input.targetWordCount ?? 1500}`,
    `site_style: ${input.siteStyle ?? "warm, conversational, specific"}`,
    "",
    "Return only a single JSON object matching the BlogDraft schema.",
  ].join("\n");
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("No JSON object found in Claude response");
}
