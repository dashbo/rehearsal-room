import { describe, expect, it } from "vitest";
import { parseMusicXmlToIR } from "@/lib/musicxml";

const enc = (s: string) => new TextEncoder().encode(s);

/** Two parts (treble + bass), SATB written as chords in one voice each —
 *  the hymn-book layout. */
function chordedHymn(): string {
  const trebleMeasure = (
    sTop: string,
    aBottom: string,
  ) => `<measure number="1">
    <attributes><divisions>1</divisions>
      <time><beats>2</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>${sTop}</step><octave>5</octave></pitch><duration>1</duration></note>
    <note><chord/><pitch><step>${aBottom}</step><octave>4</octave></pitch><duration>1</duration></note>
    <note><pitch><step>${sTop}</step><octave>5</octave></pitch><duration>1</duration></note>
    <note><chord/><pitch><step>${aBottom}</step><octave>4</octave></pitch><duration>1</duration></note>
  </measure>`;
  const bassMeasure = `<measure number="1">
    <attributes><divisions>1</divisions>
      <time><beats>2</beats><beat-type>4</beat-type></time>
      <clef><sign>F</sign><line>4</line></clef></attributes>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
    <note><chord/><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
    <note><chord/><pitch><step>G</step><octave>2</octave></pitch><duration>1</duration></note>
  </measure>`;
  return `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>MusicXML Part</part-name></score-part>
    <score-part id="P2"><part-name>MusicXML Part</part-name></score-part>
  </part-list>
  <part id="P1">${trebleMeasure("G", "B")}</part>
  <part id="P2">${bassMeasure}</part>
</score-partwise>`;
}

describe("splitVoices — chorded closed score", () => {
  it("splits treble/bass chord stacks into S/A/T/B", () => {
    const { ir } = parseMusicXmlToIR(enc(chordedHymn()), "hymn.musicxml");
    expect(ir.parts.map((p) => p.voiceType)).toEqual([
      "soprano",
      "alto",
      "tenor",
      "bass",
    ]);
    const midi = (t: string) =>
      ir.parts.find((p) => p.voiceType === t)!.notes.map((n) => n.midi);
    // soprano = top of treble stack (G5=79), alto = bottom (B4=71)
    expect(midi("soprano")).toEqual([79, 79]);
    expect(midi("alto")).toEqual([71, 71]);
    // tenor = top of bass stack (E4=64 then D4=62), bass = bottom (C3=48, G2=43)
    expect(midi("tenor")).toEqual([64, 62]);
    expect(midi("bass")).toEqual([48, 43]);
  });

  it("keeps a genuine open SATB score as four named parts", () => {
    const openScore = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Soprano</part-name></score-part>
    <score-part id="P2"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions></attributes>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration></note>
  </measure></part>
  <part id="P2"><measure number="1">
    <attributes><divisions>1</divisions></attributes>
    <note><pitch><step>G</step><octave>2</octave></pitch><duration>2</duration></note>
  </measure></part>
</score-partwise>`;
    const { ir } = parseMusicXmlToIR(enc(openScore), "open.musicxml");
    expect(ir.parts.map((p) => p.voiceType)).toEqual(["soprano", "bass"]);
    expect(ir.parts.map((p) => p.name)).toEqual(["Soprano", "Bass"]);
  });
});
