import { makeChord, type Chord, type ChordQuality } from "./chords";

/** Open-string MIDI notes, low E to high E (standard tuning). */
export const OPEN_STRINGS_MIDI = [40, 45, 50, 55, 59, 64] as const;

export interface ChordShape {
  chord: Chord;
  /** Frets low E → high E, "x" = muted. E.g. "320003" for G. */
  frets: string;
}

function shape(root: number, quality: ChordQuality, frets: string): ChordShape {
  return { chord: makeChord(root, quality), frets };
}

/** Common open chords for the practice picker (and the dev test signals). */
export const OPEN_CHORDS: readonly ChordShape[] = [
  shape(7, "maj", "320003"), // G
  shape(0, "maj", "x32010"), // C
  shape(2, "maj", "xx0232"), // D
  shape(4, "maj", "022100"), // E
  shape(9, "maj", "x02220"), // A
  shape(4, "min", "022000"), // Em
  shape(9, "min", "x02210"), // Am
  shape(2, "min", "xx0231"), // Dm
  shape(4, "7", "020100"), // E7
  shape(9, "7", "x02020"), // A7
  shape(2, "7", "xx0212"), // D7
  shape(7, "7", "320001"), // G7
  shape(9, "m7", "x02010"), // Am7
  shape(0, "maj7", "x32000"), // Cmaj7
  shape(2, "sus4", "xx0233"), // Dsus4
  shape(9, "sus2", "x02200"), // Asus2
];

/** MIDI notes sounded by a shape, low to high. */
export function shapeToMidi(frets: string): number[] {
  return [...frets].flatMap((f, string) => (f === "x" ? [] : [OPEN_STRINGS_MIDI[string] + Number(f)]));
}
