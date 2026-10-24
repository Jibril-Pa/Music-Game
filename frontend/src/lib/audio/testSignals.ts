/**
 * Synthetic guitar sounds for testing without a guitar (dev only).
 * Karplus-Strong plucked strings, which have realistic harmonics and decay.
 */

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** One plucked string mixed into `out` starting at `offset` samples. */
function addPluck(out: Float32Array, hz: number, sampleRate: number, offset: number, amp: number, seed: number) {
  let r = seed;
  const rnd = () => {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    return (r / 0x7fffffff) * 2 - 1;
  };
  // Loop delay = N - 0.5 (two-point average) + allpass fraction = sampleRate / hz.
  const period = sampleRate / hz;
  const n = Math.floor(period + 0.5);
  const frac = period + 0.5 - n;
  const c = (1 - frac) / (1 + frac);
  const noise = Float32Array.from({ length: n }, rnd);
  const pick = Math.max(1, Math.round(0.2 * n)); // pluck ~20% along the string
  const buf = noise.map((v, i) => v - noise[(i + pick) % n]);

  let idx = 0;
  let apX = 0;
  let apY = 0;
  for (let i = offset; i < out.length; i++) {
    const cur = buf[idx];
    const avg = 0.997 * 0.5 * (cur + buf[(idx + 1) % n]);
    const y = c * avg + apX - c * apY;
    apX = avg;
    apY = y;
    buf[idx] = y;
    out[i] += amp * cur;
    idx = (idx + 1) % n;
  }
}

/** A downstrum of the given MIDI notes (low to high), as raw samples. */
export function synthesizeStrum(
  midiNotes: readonly number[],
  sampleRate: number,
  { seconds = 2.5, strumMs = 12, amp = 0.12, seed = 1 } = {},
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round(sampleRate * seconds));
  midiNotes.forEach((midi, i) => {
    const offset = Math.round((i * strumMs * sampleRate) / 1000);
    addPluck(out, midiToHz(midi), sampleRate, offset, amp, seed * 7919 + i * 104729);
  });
  return out;
}

/** Browser helper: the strum as an AudioBuffer for the pipeline's "buffer" source. */
export function strumBuffer(ctx: BaseAudioContext, midiNotes: readonly number[]): AudioBuffer {
  const samples = synthesizeStrum(midiNotes, ctx.sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
