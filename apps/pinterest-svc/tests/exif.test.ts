import { describe, it, expect, vi } from "vitest";
import { ExifStripper } from "../src/exif.js";

describe("ExifStripper.stripFile", () => {
  it("skips when disabled", async () => {
    const exec = vi.fn();
    const stripper = new ExifStripper({ enabled: false, exec });
    const res = await stripper.stripFile("/tmp/x.jpg");
    expect(res.stripped).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it("runs exiftool with -all= when enabled", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const stripper = new ExifStripper({ enabled: true, exec, exiftoolPath: "/usr/bin/exiftool" });
    const res = await stripper.stripFile("/tmp/x.jpg");
    expect(res.stripped).toBe(true);
    expect(exec).toHaveBeenCalledWith("/usr/bin/exiftool", [
      "-overwrite_original",
      "-all=",
      "/tmp/x.jpg",
    ]);
  });

  it("bubbles exec failure", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("missing tool"));
    const stripper = new ExifStripper({ enabled: true, exec });
    await expect(stripper.stripFile("/tmp/x.jpg")).rejects.toThrow(/missing tool/);
  });
});

describe("ExifStripper.stripBuffer", () => {
  it("returns same buffer reference when disabled", async () => {
    const exec = vi.fn();
    const stripper = new ExifStripper({ enabled: false, exec });
    const buf = Buffer.from([1, 2, 3]);
    const out = await stripper.stripBuffer(buf, "jpg");
    expect(out).toBe(buf);
    expect(exec).not.toHaveBeenCalled();
  });

  it("writes buffer to temp file, runs exiftool, reads back", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const stripper = new ExifStripper({ enabled: true, exec });
    const buf = Buffer.from("hello-exif");
    const out = await stripper.stripBuffer(buf, "jpg");
    expect(exec).toHaveBeenCalledTimes(1);
    const [file, args] = exec.mock.calls[0]!;
    expect(file).toBe("exiftool");
    expect(args[0]).toBe("-overwrite_original");
    expect(args[1]).toBe("-all=");
    expect(args[2]).toMatch(/img\.jpg$/);
    expect(out.equals(buf)).toBe(true);
  });
});
