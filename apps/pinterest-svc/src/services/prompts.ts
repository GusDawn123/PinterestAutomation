import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PROMPT_NAMES = ["blog_draft", "pin_copy", "alt_text_generator", "interlink_picker"] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

const cache = new Map<PromptName, string>();

function promptsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "..", "..", "prompts");
}

export async function loadPrompt(name: PromptName): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;
  const text = await readFile(resolve(promptsDir(), `${name}.md`), "utf8");
  cache.set(name, text);
  return text;
}

export function clearPromptCache(): void {
  cache.clear();
}
