export const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type PitchClass = (typeof PITCH_CLASSES)[number];

/** Chords the game recognises (from the mic or the 1-4 keys). */
export const GAME_CHORD_NAMES = ["Em", "E", "G", "C", "D", "A", "Am"] as const;
export type ChordName = (typeof GAME_CHORD_NAMES)[number];

export type InputSource = "mic" | "keyboard";

export interface NoteEvent {
  /** Unique, increasing. */
  id: number;
  type: "note" | "chord";
  /** For chords: the root. */
  pitchClass: PitchClass;
  midi?: number;
  chord?: ChordName;
  /** performance.now() time of the onset (pluck / key press), ms. */
  time: number;
  /** 0..1 */
  confidence: number;
  source: InputSource;
  /** Onset -> event, ms (mic only: analysis + transport delay). */
  latencyMs?: number;
}

export function pitchClassOf(midi: number): PitchClass {
  return PITCH_CLASSES[((Math.round(midi) % 12) + 12) % 12];
}

/** "E", or "Em chord" */
export function describe(e: Pick<NoteEvent, "type" | "pitchClass" | "chord">): string {
  return e.type === "chord" ? `${e.chord}` : e.pitchClass;
}
