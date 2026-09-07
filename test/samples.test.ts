import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScore } from "@/lib/parse-score";

const sample = (name: string) =>
  new Uint8Array(
    readFileSync(path.resolve(__dirname, "../public/samples", name)),
  );

describe("bundled samples", () => {
  it("parses the SATB chorale into four named vocal parts", () => {
    const { ir, source } = parseScore(
      sample("chorale-satb.musicxml"),
      "chorale-satb.musicxml",
    );
    expect(source).toBe("musicxml");
    expect(ir.parts.map((p) => p.voiceType)).toEqual([
      "soprano",
      "alto",
      "tenor",
      "bass",
    ]);
    expect(ir.measures.length).toBe(8);
    expect(ir.tempoMap[0].bpm).toBe(84);
    for (const part of ir.parts) {
      expect(part.notes.length).toBeGreaterThan(10);
      expect(part.notes.every((n) => n.midi > 0 && n.midi < 100)).toBe(true);
    }
  });

  it("parses the 3-part round MIDI into three tracks", () => {
    const { ir, source } = parseScore(
      sample("round-three-parts.mid"),
      "round-three-parts.mid",
    );
    expect(source).toBe("midi");
    expect(ir.parts).toHaveLength(3);
    expect(ir.parts[0].notes.length).toBeGreaterThan(5);
    expect(ir.durationTicks).toBeGreaterThan(0);
  });
});
