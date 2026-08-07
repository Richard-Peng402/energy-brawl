import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const assetDirectory = path.resolve("public/assets/v3/audio/killstreak");
const expectedDurations = [1.6, 1.54, 1.56, 1.54, 4.34];

function readWaveDuration(buffer: Buffer): number {
  expect(buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(buffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
  expect(buffer.subarray(12, 16).toString("ascii")).toBe("fmt ");
  expect(buffer.readUInt16LE(20)).toBe(1);
  expect(buffer.readUInt16LE(22)).toBe(2);
  expect(buffer.readUInt16LE(34)).toBe(16);
  expect(buffer.subarray(36, 40).toString("ascii")).toBe("data");
  const byteRate = buffer.readUInt32LE(28);
  return buffer.readUInt32LE(40) / byteRate;
}

describe("natural-crystal killstreak audio assets", () => {
  it("ships five distinct, stereo WAV cues with intentional tier durations", async () => {
    const buffers = await Promise.all(
      expectedDurations.map((_, index) => readFile(path.join(assetDirectory, `kill-${index + 1}.wav`))),
    );
    const durations = buffers.map(readWaveDuration);

    expect(durations).toHaveLength(5);
    durations.forEach((duration, index) => expect(duration).toBeCloseTo(expectedDurations[index]!, 1));
    expect(durations[4]).toBeGreaterThan(Math.max(...durations.slice(0, 4)) * 2.5);
    expect(new Set(buffers.map((buffer) => buffer.toString("base64"))).size).toBe(5);
  });

  it("keeps every cue large enough to contain detail and small enough for mobile preload", async () => {
    const sizes = await Promise.all(
      expectedDurations.map(async (_, index) => (await stat(path.join(assetDirectory, `kill-${index + 1}.wav`))).size),
    );
    sizes.forEach((size) => {
      expect(size).toBeGreaterThan(250_000);
      expect(size).toBeLessThan(900_000);
    });
  });
});
