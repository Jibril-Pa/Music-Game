import { memo } from "react";
import type { Fingering } from "@/lib/combat/spells";

/**
 * A songbook chord box: vertical, low E on the left, the nut on top, finger
 * numbers in the dots. Sized in em by CSS (.fb-now / .fb-mini / .fb-book), so
 * it scales with the game frame; colours come from CSS classes (tokens).
 *   now:  the card at the bard's feet (finger digits, string names)
 *   mini: the next-up strip (shapes only)
 *   book: the Chord Book cards
 */
export type FretboardVariant = "now" | "mini" | "book";

const STRING_NAMES = ["E", "A", "D", "G", "B", "e"]; // i 0 = low E ... 5 = high e
const STRING_WORDS = ["low E", "A", "D", "G", "B", "high e"];

const x = (i: number) => 14 + i * 20;

interface Mark {
  /** String index, 0 = low E. */
  i: number;
  fret: number | "x";
  finger?: string;
}

function marksOf(fingering: Fingering): Mark[] {
  if (fingering.shape) {
    return [...fingering.shape].map((f, i) => ({ i, fret: f === "x" ? "x" : Number(f), finger: fingering.fingers?.[i] }));
  }
  // Single notes: only the main (easiest) position. string 6 = low E -> i 0.
  const n = fingering.notes?.[0];
  return n ? [{ i: 6 - n.string, fret: n.fret }] : [];
}

function labelOf(fingering: Fingering, marks: Mark[]): string {
  if (fingering.shape) return `${fingering.label} chord shape`;
  const m = marks[0];
  if (!m || m.fret === "x") return fingering.label;
  const string = STRING_WORDS[m.i];
  return m.fret === 0 ? `${fingering.label}: open ${string} string` : `${fingering.label}: fret ${m.fret} on the ${string} string`;
}

function Fretboard({ fingering, variant = "now" }: { fingering: Fingering; variant?: FretboardVariant }) {
  const mini = variant === "mini";
  const marks = marksOf(fingering);
  const highest = Math.max(0, ...marks.map((m) => (typeof m.fret === "number" ? m.fret : 0)));
  const frets = Math.max(3, highest);
  const bottom = 24 + frets * 24;
  const H = bottom + (mini ? 6 : 20);
  return (
    <svg viewBox={`0 0 128 ${H}`} className={`fretboard fb-${variant}`} role="img" aria-label={labelOf(fingering, marks)}>
      <rect className="fb-wood" x={12.5} y={24} width={103} height={frets * 24} />
      {frets >= 3 && <circle className="fb-inlay" cx={64} cy={24 + 2.5 * 24} r={3} />}
      {STRING_NAMES.map((_, i) => (
        <line key={`s${i}`} className="fb-string" x1={x(i)} x2={x(i)} y1={24} y2={bottom} strokeWidth={2.2 - i * 0.25} />
      ))}
      {Array.from({ length: frets }, (_, k) => (
        <line key={`f${k}`} className="fb-line" x1={12.5} x2={115.5} y1={24 + (k + 1) * 24} y2={24 + (k + 1) * 24} strokeWidth={1.6} />
      ))}
      <rect className="fb-nut" x={12.5} y={18} width={103} height={6} />
      {marks.map((m) => {
        if (m.fret === "x")
          return (
            <text key={`m${m.i}`} className="fb-mute" x={x(m.i)} y={16.5} textAnchor="middle">
              ×
            </text>
          );
        if (m.fret === 0) return <circle key={`o${m.i}`} className="fb-open" cx={x(m.i)} cy={11} r={5.5} strokeWidth={2.4} />;
        const cy = 24 + (m.fret - 0.5) * 24;
        return (
          <g key={`d${m.i}`}>
            {/* Digit boxes get the larger dot (the 16-unit digit fits inside); the mini strip keeps its small one. */}
            <circle className="fb-dot" cx={x(m.i)} cy={cy} r={mini ? 8.6 : 10} strokeWidth={1.5} />
            {!mini && m.finger && /[1-4]/.test(m.finger) && (
              <text className="fb-digit" x={x(m.i)} y={cy + 5.1} textAnchor="middle">
                {m.finger}
              </text>
            )}
          </g>
        );
      })}
      {!mini &&
        STRING_NAMES.map((name, i) => (
          <text key={`n${i}`} className="fb-name" x={x(i)} y={H - 5} textAnchor="middle">
            {name}
          </text>
        ))}
    </svg>
  );
}

export default memo(Fretboard);
