/**
 * Development helpers on `window` (never in production builds):
 *   __noteInput()            -> the shared NoteInput
 *   __synthPlay([{ at, midis }])  -> plays synthesized plucks/strums through the
 *                               real mic pipeline (as if from a guitar)
 *   e.g. __synthPlay([{ at: 0.2, midis: [40,47,52,55,59,64] }])   // Em strum
 */

import { synthesizeStrum } from "@/lib/audio/testSignals";
import { getNoteInput } from "./noteInput";

export function installDevHooks() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w.__noteInput = getNoteInput;
  w.__synthPlay = async (items: { at: number; midis: number[] }[], monitor = true) => {
    await getNoteInput().startMic({
      kind: "buffer",
      loop: false,
      monitor,
      createBuffer: (ctx) => {
        const end = Math.max(...items.map((i) => i.at)) + 2;
        const out = new Float32Array(Math.round(end * ctx.sampleRate));
        items.forEach((it, k) => {
          const s = synthesizeStrum(it.midis, ctx.sampleRate, { seconds: 1.5, strumMs: it.midis.length > 1 ? 12 : 0, amp: 0.12, seed: k + 1 });
          const off = Math.round(it.at * ctx.sampleRate);
          for (let j = off; j < out.length; j++) out[j] *= j - off < 1200 ? 1 - ((j - off) / 1200) * 0.7 : 0.3;
          for (let j = 0; j < s.length && off + j < out.length; j++) out[off + j] += s[j];
        });
        const b = ctx.createBuffer(1, out.length, ctx.sampleRate);
        b.copyToChannel(out, 0);
        return b;
      },
    });
  };
}
