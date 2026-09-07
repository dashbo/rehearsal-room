# Choir Practice

A web app that helps choir singers learn their parts. Add a score you have
the rights to use — upload a file, paste a link, or load a sample — then
rehearse with it:

- play the music at any tempo (pitch unchanged)
- **mute** any voice ("everything except alto"), or **Only this** to isolate one
  ("just the alto line")
- per-part volume
- notation view with a playback cursor (MusicXML scores)
- metronome and a 1-bar count-in
- loop a range of bars

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4
- Prisma + SQLite (dev) — swap `DATABASE_URL` for Postgres in production
- Audio: [Tone.js](https://tonejs.github.io/) — each part rendered as scheduled
  note events through a sampled instrument
- Notation: [OpenSheetMusicDisplay](https://opensheetmusicdisplay.github.io/)
- Parsing: `fast-xml-parser` + `fflate` (MusicXML / `.mxl`), `@tonejs/midi` (MIDI)

## Getting started

```bash
npm install
npx prisma migrate dev        # creates prisma/dev.db
npm run dev                    # http://localhost:3000
```

`npm run samples` regenerates the bundled sample scores in `public/samples/`.

## Adding scores by URL

Paste a link on the home page. Supported:

- **churchofjesuschrist.org** song pages (e.g. *Hymns for Home and Church*) —
  the page's published MusicXML (or MIDI) asset is found and downloaded.
- A direct link to a `.mxl`, `.musicxml`, `.xml`, or `.mid` file on any host.

Server-side fetches are limited to http/https and reject private/loopback
hosts. This is a basic SSRF guard, not a complete one — tighten it (allow-list,
DNS-resolution check) before exposing the app publicly.

## How it works

```
Add a score (upload · URL · sample)
  → validate (type, size ≤ 5 MB)
  → save raw file to storage/
  → parse to a Score IR (lib/score-ir.ts) — the internal model every layer consumes
  → persist Score row + IR JSON (+ sourceUrl when imported from a link)

Player page
  → loads Score IR (drives audio) + raw MusicXML (drives OSMD notation)
  → Tone.Transport schedules note events; a tempo-rate slider scales bpm
  → per-part instrument → Tone.Channel (mute / solo / volume)
  → OSMD cursor follows the transport position
```

Both MusicXML and MIDI parse into the same `ScoreIR`, so the audio engine,
mixer, and notation cursor never care which format was uploaded.

### Voice separation

MusicXML `<part>`s don't map 1:1 to vocal parts. Each part is split by
`(staff, voice)` and labelled heuristically:

- **Open score** (4 parts named Soprano/Alto/Tenor/Bass): used directly.
- **Closed score, separate voices** (2 staves, 2 voices each): the standard
  ordering — top staff = Soprano/Alto, bottom staff = Tenor/Bass.
- **Closed score, chorded** (hymn books — SATB written as chord stacks in one
  voice per staff): the top note of each treble chord is Soprano and the bottom
  is Alto; likewise Tenor/Bass on the bass staff. Unison notes go to both.
- Anything else: "Part 1", "Part 2", … with type `other`.

You can rename or relabel any part in the mixer; the change is saved to the IR.

## Known limitations (MVP)

- Voice separation for closed-score engravings is a heuristic — relabel in the
  UI if it guesses wrong.
- Repeats: forward repeats and 1st/2nd endings are expanded into a linear
  timeline. D.S. / D.C. / coda jumps are recognised but **not** expanded —
  playback runs straight through.
- Grace notes, ornaments, swing feel, and fermata rubato are ignored.
- Playback is a sampled instrument (piano / a synthetic "ooh" voice / a plain
  synth), not a real choir. Lyrics are not sung.
- The piano voice streams its samples from the Tone.js CDN; the "Synth" option
  needs no network.
- No transpose in v1.
- **No authentication.** Scores are unlisted-by-ID — anyone with the link can
  open one.

## Tests

```bash
npm test
```

`test/musicxml-parse.test.ts` covers the MusicXML parser against hand-checked
fixtures (non-480 divisions, `<backup>` with two voices, chords, dotted +
tuplet durations, tie merging, a simple repeat, tempo directions).
`test/voices.test.ts` covers vocal-part separation (chorded hymn split, open
score left alone). `test/samples.test.ts` parses the bundled sample files end
to end.

## Verifying the player by hand

1. `npm run dev`, open the app, click **Load SATB chorale (MusicXML)**.
2. Notation renders; the mixer lists Soprano / Alto / Tenor / Bass.
3. **Play** — audio starts on the click; the cursor moves through the score.
4. Drag **Tempo** to ~60% — playback and cursor slow together, pitch unchanged.
5. **Mute** alto → alto silent, others continue.
6. **Only this** on alto → only alto sounds; click it again → all return.
7. Enable **Metronome** + **count-in** → one accented bar of clicks, then playback.
8. Set **Loop bars** 3–5 and enable → the transport loops that range.
9. Load the **3-part round (MIDI)** → parts come from tracks; the notation pane
   is replaced by a bar readout.
10. Rename a part and reload → the name persists.
11. Paste `https://www.churchofjesuschrist.org/media/music/songs/welcome-home?lang=eng`
    → imports as "Welcome Home", 3/4, split into S/A/T/B.
