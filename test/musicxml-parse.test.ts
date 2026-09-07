import { describe, expect, it } from "vitest";
import { parseMusicXml } from "@/lib/musicxml/parse";
import { IR_PPQ } from "@/lib/score-ir";

/** Minimal partwise wrapper around one part's measures. */
function doc(measures: string, opts?: { partName?: string }): string {
  const name = opts?.partName ?? "Voice";
  return `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>${name}</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
}

function note(
  step: string,
  octave: number,
  duration: number,
  extra = "",
): string {
  return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration>${extra}</note>`;
}

describe("parseMusicXml", () => {
  it("normalises non-480 divisions to IR ppq", () => {
    const xml = doc(
      `<measure number="1">
        <attributes><divisions>1</divisions>
          <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        ${note("C", 4, 1)}${note("D", 4, 1)}${note("E", 4, 1)}${note("F", 4, 1)}
      </measure>`,
    );
    const score = parseMusicXml(xml);
    const notes = score.parts[0].notes;
    expect(score.ppq).toBe(IR_PPQ);
    expect(notes.map((n) => n.startTick)).toEqual([0, 480, 960, 1440]);
    expect(notes.map((n) => n.midi)).toEqual([60, 62, 64, 65]);
    expect(notes.every((n) => n.durationTick === 480)).toBe(true);
  });

  it("handles <backup> with two independent voices in one measure", () => {
    const xml = doc(
      `<measure number="1">
        <attributes><divisions>2</divisions>
          <time><beats>2</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice></note>
        <backup><duration>4</duration></backup>
        <note><pitch><step>E</step><octave>3</octave></pitch><duration>2</duration><voice>2</voice><staff>1</staff></note>
        <note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration><voice>2</voice><staff>1</staff></note>
      </measure>`,
    );
    const notes = parseMusicXml(xml).parts[0].notes;
    expect(notes).toHaveLength(3);
    const byVoice = (v: string) => notes.filter((n) => n.voice === v);
    expect(byVoice("1").map((n) => n.startTick)).toEqual([0]);
    expect(byVoice("2").map((n) => n.startTick)).toEqual([0, 480]);
  });

  it("places chord notes at the same start tick", () => {
    const xml = doc(
      `<measure number="1">
        <attributes><divisions>1</divisions></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
        <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
        <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration></note>
        <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
      </measure>`,
    );
    const notes = parseMusicXml(xml).parts[0].notes;
    expect(notes).toHaveLength(4);
    expect(notes.filter((n) => n.startTick === 0)).toHaveLength(3);
    expect(notes.find((n) => n.midi === 72)?.startTick).toBe(960);
  });

  it("resolves dotted and tuplet durations from the raw <duration>", () => {
    // divisions=6: dotted quarter = 9, eighth-triplet = 2
    const xml = doc(
      `<measure number="1">
        <attributes><divisions>6</divisions></attributes>
        ${note("C", 4, 9, "<type>quarter</type><dot/>")}
        ${note("D", 4, 3)}
        ${note("E", 4, 2, "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>")}
        ${note("F", 4, 2)}
        ${note("G", 4, 2)}
      </measure>`,
    );
    const notes = parseMusicXml(xml).parts[0].notes;
    // 9/6 * 480 = 720 ; then 3/6*480=240 ; then triplets of 160
    expect(notes.map((n) => n.startTick)).toEqual([0, 720, 960, 1120, 1280]);
    expect(notes[0].durationTick).toBe(720);
    expect(notes[2].durationTick).toBe(160);
  });

  it("merges tied notes into one sustained note", () => {
    const xml = doc(
      `<measure number="1">
        <attributes><divisions>2</divisions>
          <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/></note>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/></note>
      </measure>
      <measure number="2">
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration></note>
      </measure>`,
    );
    const notes = parseMusicXml(xml).parts[0].notes;
    expect(notes).toHaveLength(2);
    expect(notes[0].startTick).toBe(0);
    expect(notes[0].durationTick).toBe(1920); // two quarters merged
  });

  it("expands a simple forward/backward repeat", () => {
    const xml = doc(
      `<measure number="1">
        <attributes><divisions>1</divisions>
          <time><beats>1</beats><beat-type>4</beat-type></time></attributes>
        <barline location="left"><repeat direction="forward"/></barline>
        ${note("C", 4, 1)}
      </measure>
      <measure number="2">
        ${note("D", 4, 1)}
        <barline location="right"><repeat direction="backward"/></barline>
      </measure>
      <measure number="3">
        ${note("E", 4, 1)}
      </measure>`,
    );
    const score = parseMusicXml(xml);
    // played order: 1,2,1,2,3  -> 5 notes C,D,C,D,E
    expect(score.parts[0].notes.map((n) => n.midi)).toEqual([
      60, 62, 60, 62, 64,
    ]);
    expect(score.measures).toHaveLength(5);
  });

  it("treats a short opening measure as a pickup, not a padded full bar", () => {
    // 3/4, first bar holds only one quarter note (a 1-beat anacrusis) and is
    // NOT marked implicit — the engraver just wrote a partial bar.
    const xml = doc(
      `<measure number="1">
        <attributes><divisions>2</divisions>
          <time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        ${note("G", 4, 2)}
      </measure>
      <measure number="2">
        ${note("C", 5, 2)}${note("D", 5, 2)}${note("E", 5, 2)}
      </measure>`,
    );
    const score = parseMusicXml(xml);
    expect(score.measures[0].endTick).toBe(480); // one quarter, not 1440
    expect(score.measures[1].startTick).toBe(480);
    expect(score.parts[0].notes.map((n) => n.startTick)).toEqual([
      0, 480, 960, 1440,
    ]);
  });

  it("still pads a measure that is only short by rounding", () => {
    // divisions=7 makes a clean 3/4 bar land a couple ticks under 1440
    const xml = doc(
      `<measure number="1">
        <attributes><divisions>7</divisions>
          <time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        ${note("C", 4, 7)}${note("D", 4, 7)}${note("E", 4, 7)}
      </measure>
      <measure number="2">${note("F", 4, 7)}${note("G", 4, 7)}${note("A", 4, 7)}</measure>`,
    );
    const score = parseMusicXml(xml);
    expect(score.measures[0].endTick).toBe(1440);
    expect(score.measures[1].startTick).toBe(1440);
  });

  it("reads tempo from a <sound tempo> direction", () => {
    const xml = doc(
      `<measure number="1">
        <attributes><divisions>1</divisions></attributes>
        <direction><sound tempo="72"/></direction>
        ${note("C", 4, 4)}
      </measure>`,
    );
    const score = parseMusicXml(xml);
    expect(score.tempoMap[0]).toEqual({ tick: 0, bpm: 72 });
  });
});
