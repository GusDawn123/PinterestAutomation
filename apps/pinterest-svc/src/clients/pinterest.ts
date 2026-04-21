import { z } from "zod";
import type { TrendingKeyword } from "@pa/shared-types";
import { env } from "../env.js";

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";
const PINTEREST_OAUTH_BASE = "https://api.pinterest.com/v5/oauth/token";

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

const TrendingApiSchema = z.object({
  trends: z.array(
    z.object({
      keyword: z.string(),
      pct_growth_wow: z.number().optional(),
      pct_growth_mom: z.number().optional(),
      pct_growth_yoy: z.number().optional(),
      time_series: z.array(z.object({ date: z.string(), value: z.number() })).optional(),
    }),
  ),
});

export type PinterestFetch = typeof fetch;

export interface PinterestClientOptions {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  fetchImpl?: PinterestFetch;
  now?: () => number;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

export class PinterestClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;
  private readonly fetchImpl: PinterestFetch;
  private readonly now: () => number;
  private cached: CachedToken | null = null;

  constructor(opts: PinterestClientOptions = {}) {
    this.clientId = opts.clientId ?? env.PINTEREST_CLIENT_ID ?? "";
    this.clientSecret = opts.clientSecret ?? env.PINTEREST_CLIENT_SECRET ?? "";
    this.refreshToken = opts.refreshToken ?? env.PINTEREST_REFRESH_TOKEN ?? "";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  private ensureConfigured(): void {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error(
        "Pinterest client not configured — set PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, PINTEREST_REFRESH_TOKEN",
      );
    }
  }

  async getAccessToken(): Promise<string> {
    this.ensureConfigured();
    if (this.cached && this.cached.expiresAtMs > this.now() + 30_000) {
      return this.cached.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
    });
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    const res = await this.fetchImpl(PINTEREST_OAUTH_BASE, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Pinterest OAuth refresh failed: ${res.status} ${await res.text()}`);
    }
    const parsed = TokenResponseSchema.parse(await res.json());
    this.cached = {
      accessToken: parsed.access_token,
      expiresAtMs: this.now() + parsed.expires_in * 1000,
    };
    return parsed.access_token;
  }

  async getTrendingKeywords(
    region: string = "US",
    trendType: "monthly" | "weekly" | "yearly" | "seasonal" = "monthly",
  ): Promise<TrendingKeyword[]> {
    const token = await this.getAccessToken();
    const url = `${PINTEREST_API_BASE}/trends/keywords/${encodeURIComponent(region)}/top/${trendType}`;

    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Pinterest trending keywords failed: ${res.status} ${await res.text()}`);
    }
    const parsed = TrendingApiSchema.parse(await res.json());

    return parsed.trends.map((t) => {
      const growth = t.pct_growth_mom ?? t.pct_growth_wow ?? t.pct_growth_yoy ?? 0;
      const trendScore = clamp(1 + growth / 100, 0.1, 5);
      const searchVolume = estimateSearchVolume(t.time_series);
      const competition = clamp(0.5 - growth / 400, 0.1, 0.95);
      return {
        keyword: t.keyword,
        searchVolume,
        trendScore,
        competition,
      };
    });
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function estimateSearchVolume(
  series: { date: string; value: number }[] | undefined,
): number {
  if (!series || series.length === 0) return 1000;
  const avg = series.reduce((s, p) => s + p.value, 0) / series.length;
  return Math.max(1, Math.round(avg));
}
