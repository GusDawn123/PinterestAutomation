import { describe, it, expect, vi } from "vitest";
import { PinterestClient } from "../../src/clients/pinterest.js";

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PinterestClient", () => {
  it("exchanges refresh token for access token and caches it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(200, { access_token: "at-1", token_type: "Bearer", expires_in: 3600 }),
      );

    const client = new PinterestClient({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "rt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 1_000_000,
    });

    const token = await client.getAccessToken();
    const cached = await client.getAccessToken();

    expect(token).toBe("at-1");
    expect(cached).toBe("at-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect(init.body).toContain("grant_type=refresh_token");
  });

  it("throws when not configured", async () => {
    const client = new PinterestClient({
      clientId: "",
      clientSecret: "",
      refreshToken: "",
    });
    await expect(client.getAccessToken()).rejects.toThrow(/not configured/);
  });

  it("fetches trending keywords and maps to scored shape", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(200, { access_token: "at", token_type: "Bearer", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          trends: [
            {
              keyword: "cozy living room",
              pct_growth_mom: 40,
              time_series: [
                { date: "2026-01", value: 1000 },
                { date: "2026-02", value: 2000 },
              ],
            },
            {
              keyword: "minimalist desk",
              pct_growth_wow: -10,
            },
          ],
        }),
      );

    const client = new PinterestClient({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "rt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const trending = await client.getTrendingKeywords("US");

    expect(trending).toHaveLength(2);
    expect(trending[0]).toMatchObject({
      keyword: "cozy living room",
      searchVolume: 1500,
    });
    expect(trending[0]!.trendScore).toBeGreaterThan(1);
    expect(trending[0]!.competition).toBeLessThan(0.5);
    expect(trending[1]!.trendScore).toBeLessThan(1);
    expect(trending[1]!.competition).toBeGreaterThan(0.5);
  });

  it("creates a pin via POST /v5/pins", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(200, { access_token: "at", token_type: "Bearer", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(makeResponse(200, { id: "pin-777", board_id: "board-1" }));

    const client = new PinterestClient({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "rt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.createPin({
      boardId: "board-1",
      imageUrl: "https://cdn.example.com/pin.png",
      title: "Cozy nook",
      description: "A warm reading corner",
      linkBackUrl: "https://blog.example.com/cozy",
      altText: "Window seat with plants",
    });

    expect(result).toEqual({ pinId: "pin-777" });
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(String(url)).toContain("/v5/pins");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string) as {
      board_id: string;
      link: string;
      media_source: { source_type: string; url: string };
      alt_text: string;
    };
    expect(body.board_id).toBe("board-1");
    expect(body.link).toBe("https://blog.example.com/cozy");
    expect(body.media_source).toEqual({
      source_type: "image_url",
      url: "https://cdn.example.com/pin.png",
    });
    expect(body.alt_text).toBe("Window seat with plants");
  });

  it("fetches pin analytics summary and maps metric keys", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(200, { access_token: "at", token_type: "Bearer", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          all: {
            summary_metrics: {
              IMPRESSION: 1200,
              SAVE: 45,
              OUTBOUND_CLICK: 12,
              PIN_CLICK: 33,
            },
          },
        }),
      );

    const client = new PinterestClient({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "rt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const metrics = await client.getPinAnalytics("pin-123");

    expect(metrics).toEqual({
      impressions: 1200,
      saves: 45,
      outboundClicks: 12,
      closeups: 33,
    });

    const url = String(fetchImpl.mock.calls[1]![0]);
    expect(url).toContain("/v5/pins/pin-123/analytics");
    expect(url).toContain("start_date=");
    expect(url).toContain("metric_types=IMPRESSION%2CSAVE%2COUTBOUND_CLICK%2CPIN_CLICK");
  });

  it("defaults analytics metrics to 0 when summary missing", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(200, { access_token: "at", token_type: "Bearer", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(makeResponse(200, {}));

    const client = new PinterestClient({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "rt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const metrics = await client.getPinAnalytics("pin-0");
    expect(metrics).toEqual({
      impressions: 0,
      saves: 0,
      outboundClicks: 0,
      closeups: 0,
    });
  });
});
