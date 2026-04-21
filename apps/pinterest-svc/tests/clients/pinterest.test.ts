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
});
