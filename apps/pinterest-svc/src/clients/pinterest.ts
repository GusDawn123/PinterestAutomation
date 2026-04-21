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

const CreatePinResponseSchema = z.object({
  id: z.string(),
  board_id: z.string().optional(),
});

const PinAnalyticsResponseSchema = z.object({
  all: z
    .object({
      daily_metrics: z.array(
        z.object({
          date: z.string().optional(),
          data_status: z.string().optional(),
          metrics: z.record(z.string(), z.number()).optional(),
        }),
      ).optional(),
      summary_metrics: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
});

export interface CreatePinInput {
  boardId: string;
  imageUrl: string;
  title: string;
  description: string;
  linkBackUrl: string;
  altText?: string;
}

export interface PinAnalyticsMetrics {
  impressions: number;
  saves: number;
  outboundClicks: number;
  closeups: number;
}

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

  async createPin(input: CreatePinInput): Promise<{ pinId: string }> {
    const token = await this.getAccessToken();
    const url = `${PINTEREST_API_BASE}/pins`;
    const body = {
      link: input.linkBackUrl,
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 500),
      alt_text: (input.altText ?? input.title).slice(0, 500),
      board_id: input.boardId,
      media_source: {
        source_type: "image_url",
        url: input.imageUrl,
      },
    };

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Pinterest create pin failed: ${res.status} ${await res.text()}`);
    }
    const parsed = CreatePinResponseSchema.parse(await res.json());
    return { pinId: parsed.id };
  }

  async getPinAnalytics(
    pinId: string,
    opts: { startDate?: string; endDate?: string } = {},
  ): Promise<PinAnalyticsMetrics> {
    const token = await this.getAccessToken();
    const end = opts.endDate ?? isoDate(new Date());
    const start = opts.startDate ?? isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const params = new URLSearchParams({
      start_date: start,
      end_date: end,
      metric_types: "IMPRESSION,SAVE,OUTBOUND_CLICK,PIN_CLICK",
    });
    const url = `${PINTEREST_API_BASE}/pins/${encodeURIComponent(pinId)}/analytics?${params.toString()}`;

    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Pinterest pin analytics failed: ${res.status} ${await res.text()}`);
    }
    const parsed = PinAnalyticsResponseSchema.parse(await res.json());
    const summary = parsed.all?.summary_metrics ?? {};
    return {
      impressions: Math.round(summary.IMPRESSION ?? 0),
      saves: Math.round(summary.SAVE ?? 0),
      outboundClicks: Math.round(summary.OUTBOUND_CLICK ?? 0),
      closeups: Math.round(summary.PIN_CLICK ?? 0),
    };
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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
