import type { Env } from "../env.js";

export interface IdeogramGenerateParams {
  prompt: string;
  aspectRatio?: "ASPECT_1_1" | "ASPECT_9_16" | "ASPECT_16_9" | "ASPECT_3_2" | "ASPECT_2_3";
  model?: "V_2" | "V_2_TURBO";
  styleType?: "DESIGN" | "REALISTIC" | "RENDER_3D" | "ANIME";
}

export interface IdeogramGenerateResult {
  imageUrl: string;
  seed: number;
}

export class IdeogramClient {
  private apiKey: string;

  constructor(env: Pick<Env, "IDEOGRAM_API_KEY">) {
    this.apiKey = env.IDEOGRAM_API_KEY ?? "";
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generate(params: IdeogramGenerateParams): Promise<IdeogramGenerateResult> {
    if (!this.isConfigured()) {
      throw new Error("IDEOGRAM_API_KEY is not configured");
    }

    const res = await fetch("https://api.ideogram.ai/generate", {
      method: "POST",
      headers: {
        "Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_request: {
          prompt: params.prompt,
          aspect_ratio: params.aspectRatio ?? "ASPECT_1_1",
          model: params.model ?? "V_2",
          magic_prompt_option: "AUTO",
          ...(params.styleType ? { style_type: params.styleType } : {}),
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ideogram API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      data: Array<{ url: string; seed: number }>;
    };

    const first = data.data[0];
    if (!first) throw new Error("Ideogram returned no images");

    return { imageUrl: first.url, seed: first.seed };
  }
}
