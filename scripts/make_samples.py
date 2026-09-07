#!/usr/bin/env python3
"""Generate the bundled sample scores (public-domain, authored here).

Outputs:
  public/samples/chorale-satb.musicxml   - 8-bar SATB open score, 4/4
  public/samples/round-three-parts.mid   - short 3-track MIDI round
"""
import struct
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "samples"
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- MusicXML ----
# An original 8-bar hymn-style phrase in G major. Each list is one voice;
# every entry is (step, alter, octave, duration_in_quarters).
DIVISIONS = 4  # per quarter note

SOPRANO = [
    ("G", 0, 4, 1), ("A", 0, 4, 1), ("B", 0, 4, 1), ("G", 0, 4, 1),
    ("C", 0, 5, 2), ("B", 0, 4, 2),
    ("A", 0, 4, 1), ("B", 0, 4, 1), ("C", 0, 5, 1), ("A", 0, 4, 1),
    ("G", 0, 4, 4),
    ("D", 0, 5, 1), ("C", 0, 5, 1), ("B", 0, 4, 1), ("A", 0, 4, 1),
    ("B", 0, 4, 2), ("G", 0, 4, 2),
    ("A", 0, 4, 1), ("F", 1, 4, 1), ("G", 0, 4, 2),
    ("G", 0, 4, 4),
]
ALTO = [
    ("D", 0, 4, 1), ("D", 0, 4, 1), ("D", 0, 4, 1), ("E", 0, 4, 1),
    ("E", 0, 4, 2), ("D", 0, 4, 2),
    ("D", 0, 4, 1), ("D", 0, 4, 1), ("E", 0, 4, 1), ("F", 1, 4, 1),
    ("G", 0, 4, 2), ("D", 0, 4, 2),
    ("F", 1, 4, 1), ("E", 0, 4, 1), ("D", 0, 4, 1), ("D", 0, 4, 1),
    ("D", 0, 4, 2), ("D", 0, 4, 2),
    ("D", 0, 4, 1), ("D", 0, 4, 1), ("D", 0, 4, 2),
    ("B", 0, 3, 4),
]
TENOR = [
    ("B", 0, 3, 1), ("A", 0, 3, 1), ("G", 0, 3, 1), ("B", 0, 3, 1),
    ("G", 0, 3, 2), ("G", 0, 3, 2),
    ("F", 1, 3, 1), ("G", 0, 3, 1), ("G", 0, 3, 1), ("C", 0, 4, 1),
    ("B", 0, 3, 2), ("A", 0, 3, 2),
    ("A", 0, 3, 1), ("A", 0, 3, 1), ("G", 0, 3, 1), ("F", 1, 3, 1),
    ("G", 0, 3, 2), ("B", 0, 3, 2),
    ("A", 0, 3, 1), ("A", 0, 3, 1), ("B", 0, 3, 2),
    ("G", 0, 3, 4),
]
BASS = [
    ("G", 0, 3, 1), ("F", 1, 3, 1), ("E", 0, 3, 1), ("E", 0, 3, 1),
    ("C", 0, 3, 2), ("G", 0, 2, 2),
    ("D", 0, 3, 1), ("G", 0, 3, 1), ("C", 0, 3, 1), ("C", 0, 3, 1),
    ("E", 0, 3, 2), ("F", 1, 3, 2),
    ("D", 0, 3, 1), ("A", 0, 2, 1), ("B", 0, 2, 1), ("D", 0, 3, 1),
    ("G", 0, 2, 2), ("G", 0, 3, 2),
    ("D", 0, 3, 1), ("D", 0, 3, 1), ("G", 0, 2, 2),
    ("G", 0, 2, 4),
]

VOICES = [
    ("P1", "Soprano", "G", 2, SOPRANO),
    ("P2", "Alto", "G", 2, ALTO),
    ("P3", "Tenor", "G", 2, TENOR),
    ("P4", "Bass", "F", 4, BASS),
]

BEATS_PER_BAR = 4


def note_xml(step, alter, octave, dur_q):
    dur = dur_q * DIVISIONS
    acc = ""
    if alter == 1:
        acc = "      <accidental>sharp</accidental>\n"
    alter_xml = f"        <alter>{alter}</alter>\n" if alter else ""
    types = {1: "quarter", 2: "half", 4: "whole", 0.5: "eighth"}
    ntype = types.get(dur_q, "quarter")
    return (
        "      <note>\n"
        "        <pitch>\n"
        f"          <step>{step}</step>\n"
        f"{alter_xml}"
        f"          <octave>{octave}</octave>\n"
        "        </pitch>\n"
        f"        <duration>{dur}</duration>\n"
        f"        <type>{ntype}</type>\n"
        f"{acc}"
        "      </note>\n"
    )


def measures_for(voice_notes):
    """Split a flat note list into 4/4 measures (durations already fit)."""
    bars, cur, filled = [], [], 0
    for n in voice_notes:
        cur.append(n)
        filled += n[3]
        if filled >= BEATS_PER_BAR:
            bars.append(cur)
            cur, filled = [], 0
    if cur:
        bars.append(cur)
    return bars


def part_xml(pid, clef_sign, clef_line, voice_notes):
    bars = measures_for(voice_notes)
    out = [f'  <part id="{pid}">\n']
    for i, bar in enumerate(bars, start=1):
        out.append(f'    <measure number="{i}">\n')
        if i == 1:
            out.append(
                "      <attributes>\n"
                f"        <divisions>{DIVISIONS}</divisions>\n"
                "        <key><fifths>1</fifths></key>\n"
                "        <time><beats>4</beats><beat-type>4</beat-type></time>\n"
                f"        <clef><sign>{clef_sign}</sign><line>{clef_line}</line></clef>\n"
                "      </attributes>\n"
            )
        if i == 1:
            out.append(
                "      <direction placement=\"above\"><direction-type>"
                "<metronome><beat-unit>quarter</beat-unit><per-minute>84</per-minute></metronome>"
                "</direction-type><sound tempo=\"84\"/></direction>\n"
            )
        for n in bar:
            out.append(note_xml(*n))
        out.append("    </measure>\n")
    out.append("  </part>\n")
    return "".join(out)


def build_musicxml():
    parts_decl = "".join(
        f'    <score-part id="{pid}"><part-name>{name}</part-name></score-part>\n'
        for pid, name, *_ in VOICES
    )
    body = "".join(
        part_xml(pid, sign, line, notes) for pid, _n, sign, line, notes in VOICES
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" '
        '"http://www.musicxml.org/dtds/partwise.dtd">\n'
        '<score-partwise version="4.0">\n'
        "  <work><work-title>Sample Chorale in G (SATB)</work-title></work>\n"
        "  <identification><creator type=\"composer\">Choir Practice sample</creator>"
        "<rights>Public domain — authored for this app</rights></identification>\n"
        "  <part-list>\n"
        f"{parts_decl}"
        "  </part-list>\n"
        f"{body}"
        "</score-partwise>\n"
    )


# -------------------------------------------------------------------- MIDI ----
def vlq(n):
    buf = [n & 0x7F]
    n >>= 7
    while n:
        buf.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(buf))


def midi_track(events):
    data = b"".join(events)
    data += vlq(0) + b"\xFF\x2F\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + data


def voice_track(name, seq, tpq=480, channel=0, program=52):
    """seq: list of (midi, dur_quarters). Returns one MTrk chunk."""
    evs = [b"\x00" + b"\xFF\x03" + vlq(len(name)) + name.encode()]
    evs.append(b"\x00" + bytes([0xC0 | channel, program]))
    for midi, dur in seq:
        evs.append(b"\x00" + bytes([0x90 | channel, midi, 90]))
        evs.append(vlq(int(dur * tpq)) + bytes([0x80 | channel, midi, 0]))
    return midi_track(evs)


def build_midi():
    tpq = 480
    theme = [
        (60, 1), (60, 1), (62, 1), (64, 1),
        (64, 1), (62, 1), (64, 1), (65, 1), (67, 2), (0, 0),
        (72, 1), (67, 1), (64, 1), (60, 1),
        (67, 1), (65, 1), (64, 1), (62, 1), (60, 2),
    ]
    theme = [(m, d) for m, d in theme if d > 0]

    header_events = [
        b"\x00" + b"\xFF\x51\x03" + struct.pack(">I", 500000)[1:],  # 120 bpm
        b"\x00" + b"\xFF\x58\x04\x04\x02\x18\x08",  # 4/4
    ]
    tracks = [midi_track(header_events)]
    for name, tr, ch in [("Voice 1", 12, 0), ("Voice 2", 0, 1), ("Voice 3", -12, 2)]:
        tracks.append(
            voice_track(name, [(m + tr, d) for m, d in theme], tpq=tpq, channel=ch)
        )

    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), tpq)
    return header + b"".join(tracks)


def main():
    (OUT / "chorale-satb.musicxml").write_text(build_musicxml(), encoding="utf-8")
    (OUT / "round-three-parts.mid").write_bytes(build_midi())
    print("wrote", OUT / "chorale-satb.musicxml")
    print("wrote", OUT / "round-three-parts.mid")


if __name__ == "__main__":
    main()
