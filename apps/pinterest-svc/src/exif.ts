import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "./env.js";

const execFileAsync = promisify(execFile);

export interface ExifStripOptions {
  exiftoolPath?: string;
  enabled?: boolean;
  exec?: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  vendored?: boolean;
}

async function vendoredExec(
  _file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const { exiftool } = await import("exiftool-vendored");
  const filePath = args[args.length - 1]!;
  const writeArgs = args.slice(0, -1);
  await exiftool.write(filePath, {}, { writeArgs });
  return { stdout: "", stderr: "" };
}

export class ExifStripper {
  private readonly exiftoolPath: string;
  private readonly enabled: boolean;
  private readonly exec: NonNullable<ExifStripOptions["exec"]>;

  constructor(opts: ExifStripOptions = {}) {
    this.exiftoolPath = opts.exiftoolPath ?? "exiftool";
    this.enabled = opts.enabled ?? env.STRIP_EXIF;
    const useVendored = opts.vendored ?? opts.exec === undefined;
    this.exec =
      opts.exec ??
      (useVendored
        ? vendoredExec
        : async (file, args) => {
            const { stdout, stderr } = await execFileAsync(file, args, { timeout: 30_000 });
            return { stdout, stderr };
          });
  }

  async stripFile(filePath: string): Promise<{ stripped: boolean }> {
    if (!this.enabled) return { stripped: false };
    await this.exec(this.exiftoolPath, ["-overwrite_original", "-all=", filePath]);
    return { stripped: true };
  }

  async stripBuffer(data: Buffer, extHint: string): Promise<Buffer> {
    if (!this.enabled) return data;
    const dir = await mkdtemp(join(tmpdir(), "pa-exif-"));
    const file = join(dir, `img.${extHint}`);
    try {
      await writeFile(file, data);
      await this.stripFile(file);
      return await readFile(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
