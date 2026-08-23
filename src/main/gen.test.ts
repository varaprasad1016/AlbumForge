import { describe, expect, it, vi } from "vitest";
import { pollBflResult, pollinationsUrl, sniffImageType } from "./gen";

describe("pollinationsUrl", () => {
  it("encodes the prompt and applies size + no-logo", () => {
    const url = pollinationsUrl("gold mandala on transparent background", { width: 512, height: 640, seed: 42 });
    expect(url).toContain("/prompt/gold%20mandala%20on%20transparent%20background");
    expect(url).toContain("width=512");
    expect(url).toContain("height=640");
    expect(url).toContain("nologo=true");
    expect(url).toContain("seed=42");
  });

  it("defaults to 768 square with a random seed when no options given", () => {
    const url = pollinationsUrl("peacock feather");
    expect(url).toContain("width=768");
    expect(url).toContain("height=768");
    expect(url).toMatch(/seed=\d+/);
  });
});

describe("pollBflResult", () => {
  it("polls until Ready and returns the sample URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "Processing" }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "Ready", result: { sample: "https://cdn.bfl.ai/results/abc.png" } }),
      } as Response);
    const url = await pollBflResult("job-1", "key", fetchImpl as unknown as typeof fetch, 5000);
    expect(url).toBe("https://cdn.bfl.ai/results/abc.png");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/v1/get_result?id=job-1"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer key" }) }),
    );
  });

  it("throws on provider error", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "Error", error: "over quota" }),
    } as Response);
    await expect(pollBflResult("job-2", "key", fetchImpl as unknown as typeof fetch, 5000)).rejects.toThrow(
      "over quota",
    );
  });

  it("times out when never ready", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "Processing" }),
    } as Response);
    await expect(pollBflResult("job-3", "key", fetchImpl as unknown as typeof fetch, 100)).rejects.toThrow("timed out");
  });
});

describe("sniffImageType", () => {
  it("detects PNG from the signature", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(sniffImageType(buf)).toBe("png");
  });

  it("detects JPEG from the signature", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(sniffImageType(buf)).toBe("jpeg");
  });

  it("defaults to png for unknown bytes", () => {
    expect(sniffImageType(Buffer.from("hello world"))).toBe("png");
  });
});
