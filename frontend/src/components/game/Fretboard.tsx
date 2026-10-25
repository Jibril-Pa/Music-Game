import type { Fingering } from "@/lib/combat/spells";

const STRING_NAMES = ["e", "B", "G", "D", "A", "E"]; // string 1 (top) .. 6

/** Small SVG fretboard: strings drawn like tab (high e on top), frets 0-5. */
export default function Fretboard({ fingering, size = 1 }: { fingering: Fingering; size?: number }) {
  const frets = 5;
  const w = 170 * size;
  const h = 92 * size;
  const left = 26 * size;
  const top = 10 * size;
  const sx = (w - left - 8 * size) / frets;
  const sy = (h - top * 2) / 5;
  const marks: { string: number; fret: number; main: boolean; finger?: string }[] = [];
  const muted: number[] = [];
  if (fingering.shape) {
    [...fingering.shape].forEach((f, i) => {
      const string = 6 - i; // shape is low E -> high E
      if (f === "x") muted.push(string);
      else marks.push({ string, fret: Number(f), main: true, finger: fingering.fingers?.[i] });
    });
  } else {
    (fingering.notes ?? []).forEach((n, i) => marks.push({ ...n, main: i === 0 }));
  }
  const y = (string: number) => top + (string - 1) * sy;
  const x = (fret: number) => (fret === 0 ? left - 12 * size : left + (fret - 0.5) * sx);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="fretboard" role="img" aria-label={`${fingering.label} on the fretboard`}>
      <rect x={left} y={top - 4 * size} width={w - left - 8 * size} height={h - top * 2 + 8 * size} fill="#e9c89a" rx={4} />
      {Array.from({ length: frets + 1 }, (_, i) => (
        <line key={i} x1={left + i * sx} x2={left + i * sx} y1={top - 4 * size} y2={h - top + 4 * size} stroke="#2b1a12" strokeWidth={i === 0 ? 5 * size : 1.5} />
      ))}
      {[3, 5].map((f) => (
        <circle key={f} cx={left + (f - 0.5) * sx} cy={h / 2} r={3 * size} fill="#b8946a" />
      ))}
      {STRING_NAMES.map((name, i) => (
        <g key={i}>
          <line x1={left} x2={w - 8 * size} y1={y(i + 1)} y2={y(i + 1)} stroke="#6b4226" strokeWidth={1 + i * 0.35} />
          <text x={4 * size} y={y(i + 1) + 4 * size} fontSize={10 * size} fill="#6b4226">
            {name}
          </text>
        </g>
      ))}
      {muted.map((s) => (
        <text key={`m${s}`} x={left - 17 * size} y={y(s) + 4 * size} fontSize={11 * size} fill="#9b2c2c" fontWeight="bold">
          ×
        </text>
      ))}
      {marks.map((m, i) =>
        m.fret === 0 ? (
          <circle key={i} cx={x(0)} cy={y(m.string)} r={5 * size} fill="none" stroke={m.main ? "#c8553d" : "#c8553d88"} strokeWidth={2.5} />
        ) : (
          <g key={i}>
            <circle cx={x(m.fret)} cy={y(m.string)} r={6.5 * size} fill={m.main ? "#c8553d" : "#c8553d66"} stroke="#2b1a12" strokeWidth={1.5} />
            {m.finger && /[1-4]/.test(m.finger) && (
              <text x={x(m.fret)} y={y(m.string) + 3.4 * size} fontSize={9.5 * size} fontWeight="bold" fill="#fff6dc" textAnchor="middle">
                {m.finger}
              </text>
            )}
          </g>
        ),
      )}
      {fingering.notes && fingering.notes[0] && (
        <text x={w - 10 * size} y={h - 2 * size} fontSize={9 * size} fill="#6b4226" textAnchor="end">
          {fingering.notes[0].fret === 0 ? "open string" : `fret ${fingering.notes[0].fret}`}
        </text>
      )}
    </svg>
  );
}
