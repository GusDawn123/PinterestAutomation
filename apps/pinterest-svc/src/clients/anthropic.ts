import Anthropic from "@anthropic-ai/sdk";
import { BlogDraftSchema, type BlogDraft } from "@pa/shared-types";
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
