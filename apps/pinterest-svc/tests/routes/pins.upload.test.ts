import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";
import type { PinsApprovalPayload } from "@pa/shared-types";

let mock: MockCtx;
const app = await buildServer({ ctx: (mock = makeMockCtx()).ctx });

beforeEach(() => {
  mock.approvals.listByRun.mockReset();
  mock.approvals.updatePayload.mockReset();
  mock.wordpress.uploadMedia.mockReset();
});

afterAll(async () => {
  await app.close();
});

const runId = "00000000-0000-4000-8000-000000000e00";
const approvalId = "00000000-0000-4000-8000-000000000e01";

function makeApprovalWithEmptyPin(): Record<string, unknown> {
  return {
    id: approvalId,
    kind: "pins",
    status: "pending",
    payload: {
      blogUrl: "https://blog.example.com/x",
      boardId: "board-1",
      pins: [
        {
          pinIndex: 0,
          sourceImageUrl: "https://cdn.example.com/a.png",
          composedImageUrl: "",
          needsManualCompose: true,
          variations: [{ title: "Pin one", description: "D" }],
        },
        {
          pinIndex: 1,
          sourceImageUrl: "https://cdn.example.com/b.png",
          composedImageUrl: "",
          needsManualCompose: true,
          variations: [{ title: "Pin two", description: "D2" }],
        },
      ],
    } satisfies PinsApprovalPayload,
  };
}

function buildMultipart(
  filename: string,
  contentType: string,
  fileData: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----pa-test-boundary-" + Math.random().toString(16).slice(2);
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const payload = Buffer.concat([preamble, fileData, closing]);
  return {
    payload,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(payload.length),
    },
  };
}

describe("POST /workflows/:id/pins/:pinIndex/upload", () => {
  it("uploads the file to WP and patches the pin with sourceUrl", async () => {
    mock.approvals.listByRun.mockResolvedValue([makeApprovalWithEmptyPin()] as never);
    mock.wordpress.uploadMedia.mockResolvedValue({
      mediaId: 7777,
      sourceUrl: "https://wp.example.com/pin-0.jpg",
    } as never);
    mock.approvals.updatePayload.mockResolvedValue({} as never);

    const { payload, headers } = buildMultipart(
      "pin.jpg",
      "image/jpeg",
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/pins/0/upload`,
      payload,
      headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      pin: { composedImageUrl: string; needsManualCompose: boolean; pinIndex: number };
    };
    expect(body.pin.pinIndex).toBe(0);
    expect(body.pin.composedImageUrl).toBe("https://wp.example.com/pin-0.jpg");
    expect(body.pin.needsManualCompose).toBe(false);

    expect(mock.wordpress.uploadMedia).toHaveBeenCalledTimes(1);
    const uploadArg = mock.wordpress.uploadMedia.mock.calls[0]![0] as {
      contentType: string;
      filename: string;
      altText: string;
    };
    expect(uploadArg.contentType).toBe("image/jpeg");
    expect(uploadArg.altText).toBe("Pin one");

    const [, updatedPayload] = mock.approvals.updatePayload.mock.calls[0]!;
    const updatedPins = (updatedPayload as PinsApprovalPayload).pins;
    expect(updatedPins[0]!.composedImageUrl).toBe("https://wp.example.com/pin-0.jpg");
    expect(updatedPins[0]!.needsManualCompose).toBe(false);
    expect(updatedPins[1]!.composedImageUrl).toBe("");
    expect(updatedPins[1]!.needsManualCompose).toBe(true);
  });

  it("400s when the requested pinIndex does not exist in the approval", async () => {
    mock.approvals.listByRun.mockResolvedValue([makeApprovalWithEmptyPin()] as never);

    const { payload, headers } = buildMultipart(
      "pin.jpg",
      "image/jpeg",
      Buffer.from([0xff, 0xd8]),
    );

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/pins/99/upload`,
      payload,
      headers,
    });

    expect(res.statusCode).toBe(400);
    expect(mock.wordpress.uploadMedia).not.toHaveBeenCalled();
    expect(mock.approvals.updatePayload).not.toHaveBeenCalled();
  });

  it("404s when no pending pins approval", async () => {
    mock.approvals.listByRun.mockResolvedValue([] as never);

    const { payload, headers } = buildMultipart(
      "pin.jpg",
      "image/jpeg",
      Buffer.from([0xff, 0xd8]),
    );

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/pins/0/upload`,
      payload,
      headers,
    });
    expect(res.statusCode).toBe(404);
  });
});
