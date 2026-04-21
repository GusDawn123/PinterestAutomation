import { describe, it, expect } from "vitest";
import { convertPngToJpeg } from "../../src/routes/wordpress.js";

function makeTinyPng(): Buffer {
  // 1x1 transparent PNG (base64-decoded)
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
}

describe("convertPngToJpeg", () => {
  it("converts PNG buffer to JPEG and updates contentType", async () => {
    const png = makeTinyPng();
    const out = await convertPngToJpeg(png, "image/png");
    expect(out.contentType).toBe("image/jpeg");
    // JPEG SOI marker is FF D8 FF
    expect(out.data[0]).toBe(0xff);
    expect(out.data[1]).toBe(0xd8);
    expect(out.data[2]).toBe(0xff);
  });

  it("converts WebP contentType marker even when bytes are PNG (declared mime wins)", async () => {
    const png = makeTinyPng();
    const out = await convertPngToJpeg(png, "image/webp");
    expect(out.contentType).toBe("image/jpeg");
  });

  it("passes JPEG through unchanged", async () => {
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const out = await convertPngToJpeg(jpegBytes, "image/jpeg");
    expect(out.contentType).toBe("image/jpeg");
    expect(out.data).toBe(jpegBytes);
  });

  it("passes non-convertible types through unchanged", async () => {
    const gif = Buffer.from([0x47, 0x49, 0x46]);
    const out = await convertPngToJpeg(gif, "image/gif");
    expect(out.contentType).toBe("image/gif");
    expect(out.data).toBe(gif);
  });
});
