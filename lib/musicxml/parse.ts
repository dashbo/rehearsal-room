import { IR_PPQ } from "@/lib/score-ir";
import {
  attr,
  childrenOf,
  findChild,
  findChildren,
  findDeep,
  numOf,
  parseXml,
  tagName,
  textOf,
  XmlNode,
} from "./xml-tree";

export interface RawNote {
  startTick: number; // absolute, IR ticks
  durationTick: number;
  midi: number;
  velocity: number;
  staff: number;
  voice: string;
}

export interface RawPart {
  id: string;
  name: string;
  staves: number;
  notes: RawNote[];
}

export interface RawScore {
  title: string;
  ppq: number;
  durationTicks: number;
  tempoMap: { tick: number; bpm: number }[];
  timeSignatures: { tick: number; numerator: number; denominator: number }[];
  measures: { index: number; startTick: number; endTick: number }[];
  parts: RawPart[];
  warnings: string[];
}

const STEP_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const DEFAULT_VELOCITY = 0.8;
const MAX_PLAN_MEASURES = 4000;

interface MeasureBarline {
  repeatForward: boolean;
  repeatBackwardTimes: number | null;
  endingStart: number[] | null;
  endingStop: boolean;
}

interface ParsedPartMeasure {
  notes: Array<Omit<RawNote, "startTick"> & { relStart: number }>;
  contentEnd: number;
}

interface GlobalMeasure {
  number: string;
  implicit: boolean;
  lengthTick: number;
  timeSig: { numerator: number; denominator: number } | null;
  tempos: { relTick: number; bpm: number }[];
  barline: MeasureBarline;
}

function pitchToMidi(pitchNode: XmlNode): number | null {
  const step = textOf(findChild(pitchNode, "step")).toUpperCase();
  const semis = STEP_SEMITONE[step];
  if (semis === undefined) return null;
  const octave = numOf(findChild(pitchNode, "octave"), 4);
  const alter = Math.round(numOf(findChild(pitchNode, "alter"), 0));
  return (octave + 1) * 12 + semis + alter;
}

function emptyBarline(): MeasureBarline {
  return {
    repeatForward: false,
    repeatBackwardTimes: null,
    endingStart: null,
    endingStop: false,
  };
}

type LinearNote = Omit<RawNote, "startTick"> & {
  relStartAbs: number;
  tieStart: boolean;
  tieStop: boolean;
  measureIndex: number;
};

/** Merge tied notes within one part's linear note list. */
function mergeTies(notes: LinearNote[]): LinearNote[] {
  const merged: LinearNote[] = [];
  for (const note of notes) {
    let consumed = false;
    if (note.tieStop) {
      for (let i = merged.length - 1; i >= 0; i--) {
        const prev = merged[i];
        if (
          prev.tieStart &&
          prev.midi === note.midi &&
          prev.voice === note.voice &&
          prev.staff === note.staff &&
          Math.abs(prev.relStartAbs + prev.durationTick - note.relStartAbs) <= 2
        ) {
          prev.durationTick += note.durationTick;
          prev.tieStart = note.tieStart; // tie may continue further
          consumed = true;
          break;
        }
      }
    }
    if (!consumed) merged.push(note);
  }
  return merged;
}

function parsePartMeasures(partNode: XmlNode, warnings: Set<string>) {
  const measures: ParsedPartMeasure[] = [];
  let divisions = 1;
  let staves = 1;

  // linear buffer for tie merging across the whole part
  const linear: LinearNote[] = [];
  let measureBaseAbs = 0;

  const measureNodes = findChildren(partNode, "measure");

  measureNodes.forEach((measureNode, measureIndex) => {
    let cursor = 0;
    let lastNoteStart = 0;
    let contentEnd = 0;

    for (const el of childrenOf(measureNode)) {
      const tag = tagName(el);
      if (tag === "attributes") {
        const d = findChild(el, "divisions");
        if (d) divisions = numOf(d, divisions) || divisions;
        const s = findChild(el, "staves");
        if (s) staves = numOf(s, staves) || staves;
      } else if (tag === "backup") {
        cursor -= (numOf(findChild(el, "duration"), 0) * IR_PPQ) / divisions;
        if (cursor < 0) cursor = 0;
      } else if (tag === "forward") {
        cursor += (numOf(findChild(el, "duration"), 0) * IR_PPQ) / divisions;
        contentEnd = Math.max(contentEnd, cursor);
      } else if (tag === "note") {
        const isGrace = !!findChild(el, "grace");
        const isChord = !!findChild(el, "chord");
        const isRest = !!findChild(el, "rest");
        const durDivisions = numOf(findChild(el, "duration"), 0);
        const durationTick = Math.round((durDivisions * IR_PPQ) / divisions);
        const staff = numOf(findChild(el, "staff"), 1);
        const voice = textOf(findChild(el, "voice")) || "1";

        if (isGrace) {
          warnings.add("Grace notes are ignored in playback.");
          continue;
        }

        const start = isChord ? lastNoteStart : cursor;

        if (!isRest) {
          const pitchNode = findChild(el, "pitch");
          const midi = pitchNode ? pitchToMidi(pitchNode) : null;
          if (midi !== null && midi >= 0 && midi <= 127) {
            const ties = findChildren(el, "tie");
            const tieStart = ties.some((t) => attr(t, "type") === "start");
            const tieStop = ties.some((t) => attr(t, "type") === "stop");
            linear.push({
              relStartAbs: measureBaseAbs + start,
              durationTick,
              midi,
              velocity: DEFAULT_VELOCITY,
              staff,
              voice,
              tieStart,
              tieStop,
              measureIndex,
            });
          }
        }

        if (!isChord) {
          lastNoteStart = start;
          cursor = start + durationTick;
        } else {
          cursor = Math.max(cursor, start + durationTick);
        }
        contentEnd = Math.max(contentEnd, cursor);
      }
    }

    measures.push({ notes: [], contentEnd });
    measureBaseAbs += contentEnd;
  });

  // tie merge over the whole part, then bucket back per measure
  const mergedLinear = mergeTies(linear);
  // recompute per-measure buckets using measure base offsets
  const baseOffsets: number[] = [];
  let acc = 0;
  for (const m of measures) {
    baseOffsets.push(acc);
    acc += m.contentEnd;
  }
  for (const note of mergedLinear) {
    const mi = note.measureIndex;
    const relStart = note.relStartAbs - baseOffsets[mi];
    measures[mi].notes.push({
      relStart,
      durationTick: note.durationTick,
      midi: note.midi,
      velocity: note.velocity,
      staff: note.staff,
      voice: note.voice,
    });
  }

  return { measures, staves };
}

function parseGlobalMeasures(
  partNode: XmlNode,
  partContentEnds: number[],
): GlobalMeasure[] {
  const measureNodes = findChildren(partNode, "measure");
  let divisions = 1;
  let curTimeSig: { numerator: number; denominator: number } | null = null;

  return measureNodes.map((measureNode, i) => {
    const implicit = String(attr(measureNode, "implicit") ?? "") === "yes";
    const barline = emptyBarline();
    const tempos: { relTick: number; bpm: number }[] = [];
    let cursor = 0;
    let timeSig: { numerator: number; denominator: number } | null = null;

    for (const el of childrenOf(measureNode)) {
      const tag = tagName(el);
      if (tag === "attributes") {
        const d = findChild(el, "divisions");
        if (d) divisions = numOf(d, divisions) || divisions;
        const t = findChild(el, "time");
        if (t) {
          const numerator = numOf(findChild(t, "beats"), 4);
          const denominator = numOf(findChild(t, "beat-type"), 4);
          timeSig = { numerator, denominator };
          curTimeSig = timeSig;
        }
      } else if (tag === "backup") {
        cursor -= (numOf(findChild(el, "duration"), 0) * IR_PPQ) / divisions;
      } else if (tag === "forward" || tag === "note") {
        if (tag === "note" && findChild(el, "chord")) {
          // chord doesn't advance
        } else {
          cursor += (numOf(findChild(el, "duration"), 0) * IR_PPQ) / divisions;
        }
      } else if (tag === "direction" || tag === "sound") {
        const sound = tag === "sound" ? el : findDeep(el, "sound");
        if (sound) {
          const tempo = attr(sound, "tempo");
          if (tempo !== undefined && Number.isFinite(Number(tempo))) {
            tempos.push({ relTick: Math.max(0, cursor), bpm: Number(tempo) });
          }
        }
      } else if (tag === "barline") {
        const repeat = findChild(el, "repeat");
        if (repeat) {
          const dir = attr(repeat, "direction");
          if (dir === "forward") barline.repeatForward = true;
          if (dir === "backward") {
            const times = Number(attr(repeat, "times") ?? 2);
            barline.repeatBackwardTimes = Number.isFinite(times) ? times : 2;
          }
        }
        const ending = findChild(el, "ending");
        if (ending) {
          const type = attr(ending, "type");
          const numbers = String(attr(ending, "number") ?? "")
            .split(/[,\s]+/)
            .map((n) => parseInt(n, 10))
            .filter((n) => Number.isFinite(n));
          if (type === "start") barline.endingStart = numbers;
          if (type === "stop" || type === "discontinue") barline.endingStop = true;
        }
      }
    }

    const effTimeSig = timeSig ?? curTimeSig;
    const timeSigLen = effTimeSig
      ? Math.round(
          effTimeSig.numerator * ((IR_PPQ * 4) / effTimeSig.denominator),
        )
      : 0;
    const contentEnd = partContentEnds[i] ?? 0;
    // The written content (max across parts) is the source of truth for how
    // long a measure lasts. Engravers fill measures with explicit rests, so a
    // measure that comes up short is a genuine pickup / partial bar (anacrusis,
    // the bar before a repeat, a mid-phrase meter change) — not silence to pad.
    // Only fall back to the time signature when there's no content at all, and
    // snap to it when the content is within a 32nd note (accumulated rounding).
    const tolerance = IR_PPQ / 8;
    let lengthTick: number;
    if (contentEnd <= 0) {
      lengthTick = timeSigLen || IR_PPQ * 4;
    } else if (timeSigLen && Math.abs(contentEnd - timeSigLen) <= tolerance) {
      lengthTick = timeSigLen;
    } else {
      lengthTick = contentEnd;
    }

    return {
      number: String(attr(measureNode, "number") ?? i + 1),
      implicit,
      lengthTick,
      timeSig,
      tempos,
      barline,
    };
  });
}

/** Expand repeats / simple 1st–2nd endings into a flat measure order. */
function buildPlan(
  globals: GlobalMeasure[],
  warnings: Set<string>,
): number[] {
  const plan: number[] = [];
  let repeatStart = 0;
  let pass = 1;
  let i = 0;
  let guard = 0;

  while (i < globals.length && plan.length < MAX_PLAN_MEASURES) {
    if (guard++ > MAX_PLAN_MEASURES * 2) break;
    const m = globals[i];

    if (m.barline.repeatForward && repeatStart !== i) {
      repeatStart = i;
      pass = 1;
    }

    // ending that doesn't apply on this pass -> skip the ending block
    if (m.barline.endingStart && !m.barline.endingStart.includes(pass)) {
      let j = i;
      while (j < globals.length) {
        const mj = globals[j];
        if (mj.barline.endingStop) {
          j++;
          break;
        }
        if (
          j !== i &&
          mj.barline.endingStart &&
          mj.barline.endingStart.includes(pass)
        ) {
          break;
        }
        j++;
      }
      if (globals.slice(i, j).some((mm) => mm.barline.repeatBackwardTimes)) {
        // the repeat lived inside the skipped block; stop repeating
        i = j;
        pass = 1;
        continue;
      }
      i = j;
      continue;
    }

    plan.push(i);

    if (m.barline.repeatBackwardTimes) {
      const times = m.barline.repeatBackwardTimes;
      if (pass < times) {
        pass++;
        i = repeatStart;
        continue;
      }
      pass = 1;
    }
    i++;
  }

  if (plan.length >= MAX_PLAN_MEASURES) {
    warnings.add(
      "Score has an unusually long repeat structure; playback was truncated.",
    );
  }
  return plan;
}

export function parseMusicXml(xml: string): RawScore {
  const warnings = new Set<string>();
  const tree = parseXml(xml);

  const timewise = tree.find((n) => tagName(n) === "score-timewise");
  const partwise = tree.find((n) => tagName(n) === "score-partwise");
  const root = partwise ?? timewise;
  if (!root) throw new Error("Not a MusicXML document (no <score-partwise>).");
  if (timewise && !partwise) {
    throw new Error(
      "score-timewise MusicXML is not supported. Re-export as partwise (the default).",
    );
  }

  // title
  const workTitle = textOf(findDeep(root, "work-title"));
  const movementTitle = textOf(findDeep(root, "movement-title"));
  const title = workTitle || movementTitle || "Untitled score";

  // part-list names
  const partList = findChild(root, "part-list");
  const nameById = new Map<string, string>();
  if (partList) {
    for (const sp of findChildren(partList, "score-part")) {
      const id = String(attr(sp, "id") ?? "");
      const nm = textOf(findChild(sp, "part-name"));
      if (id) nameById.set(id, nm || id);
    }
  }

  const partNodes = findChildren(root, "part");
  if (partNodes.length === 0) throw new Error("MusicXML has no <part> elements.");

  // per-part measure parse
  const perPart = partNodes.map((pn) => {
    const id = String(attr(pn, "id") ?? "");
    const { measures, staves } = parsePartMeasures(pn, warnings);
    return { id, node: pn, name: nameById.get(id) ?? id ?? "Part", measures, staves };
  });

  const measureCount = Math.max(...perPart.map((p) => p.measures.length));

  // content-end per measure = max across parts (used for measure length)
  const contentEnds: number[] = [];
  for (let i = 0; i < measureCount; i++) {
    contentEnds.push(
      Math.max(0, ...perPart.map((p) => p.measures[i]?.contentEnd ?? 0)),
    );
  }

  // global timeline from the first part's structure, tempos merged from all
  const globals = parseGlobalMeasures(perPart[0].node, contentEnds);
  for (let pi = 1; pi < perPart.length; pi++) {
    const g = parseGlobalMeasures(perPart[pi].node, contentEnds);
    g.forEach((gm, i) => {
      if (!globals[i]) return;
      for (const t of gm.tempos) {
        if (
          !globals[i].tempos.some(
            (x) => x.relTick === t.relTick && x.bpm === t.bpm,
          )
        ) {
          globals[i].tempos.push(t);
        }
      }
      if (!globals[i].timeSig && gm.timeSig) globals[i].timeSig = gm.timeSig;
    });
  }
  // pad globals to measureCount
  while (globals.length < measureCount) {
    globals.push({
      number: String(globals.length + 1),
      implicit: false,
      lengthTick: contentEnds[globals.length] || IR_PPQ * 4,
      timeSig: null,
      tempos: [],
      barline: emptyBarline(),
    });
  }

  const hasRepeats = globals.some(
    (g) => g.barline.repeatForward || g.barline.repeatBackwardTimes,
  );
  const plan = hasRepeats
    ? buildPlan(globals, warnings)
    : globals.map((_, i) => i);

  if (findDeep(root, "dal-segno") || findDeep(root, "dacapo")) {
    warnings.add(
      "D.S. / D.C. jumps are recognised but not expanded; playback runs straight through.",
    );
  }

  // emit
  const tempoMap: { tick: number; bpm: number }[] = [];
  const timeSignatures: {
    tick: number;
    numerator: number;
    denominator: number;
  }[] = [];
  const measures: { index: number; startTick: number; endTick: number }[] = [];
  const partNotes = new Map<string, RawNote[]>();
  for (const p of perPart) partNotes.set(p.id, []);

  let absOffset = 0;
  let lastTimeSigKey = "";
  plan.forEach((sourceIdx, playIdx) => {
    const g = globals[sourceIdx];
    const startTick = absOffset;
    const len = g.lengthTick || contentEnds[sourceIdx] || IR_PPQ * 4;

    if (g.timeSig) {
      const key = `${g.timeSig.numerator}/${g.timeSig.denominator}`;
      if (key !== lastTimeSigKey) {
        timeSignatures.push({
          tick: startTick,
          numerator: g.timeSig.numerator,
          denominator: g.timeSig.denominator,
        });
        lastTimeSigKey = key;
      }
    }
    for (const t of g.tempos) {
      tempoMap.push({ tick: startTick + Math.min(t.relTick, len), bpm: t.bpm });
    }

    for (const p of perPart) {
      const pm = p.measures[sourceIdx];
      if (!pm) continue;
      const bucket = partNotes.get(p.id)!;
      for (const n of pm.notes) {
        bucket.push({
          startTick: Math.round(startTick + n.relStart),
          durationTick: Math.max(1, Math.round(n.durationTick)),
          midi: n.midi,
          velocity: n.velocity,
          staff: n.staff,
          voice: n.voice,
        });
      }
    }

    measures.push({ index: playIdx + 1, startTick, endTick: startTick + len });
    absOffset += len;
  });

  if (tempoMap.length === 0 || tempoMap[0].tick !== 0) {
    tempoMap.unshift({ tick: 0, bpm: tempoMap[0]?.bpm ?? 100 });
  }
  if (timeSignatures.length === 0 || timeSignatures[0].tick !== 0) {
    timeSignatures.unshift({ tick: 0, numerator: 4, denominator: 4 });
  }
  tempoMap.sort((a, b) => a.tick - b.tick);
  timeSignatures.sort((a, b) => a.tick - b.tick);

  const parts: RawPart[] = perPart.map((p) => {
    const notes = (partNotes.get(p.id) ?? []).sort(
      (a, b) => a.startTick - b.startTick || a.midi - b.midi,
    );
    return { id: p.id, name: p.name, staves: p.staves, notes };
  });

  const durationTicks = Math.max(
    absOffset,
    ...parts.flatMap((p) => p.notes.map((n) => n.startTick + n.durationTick)),
    1,
  );

  return {
    title,
    ppq: IR_PPQ,
    durationTicks,
    tempoMap,
    timeSignatures,
    measures,
    parts,
    warnings: [...warnings],
  };
}
