import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "../src/server.js";

const app = await buildServer();

afterAll(async () => {
  await app.close();
});

describe("health routes", () => {
  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("pinterest-svc");
  });

  it("GET /ready returns ready", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ready: true });
  });
});
