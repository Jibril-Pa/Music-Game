/**
 * Reusable audio input pipeline: mic (or a test oscillator) -> AudioWorklet
 * that slices the signal into fixed frames -> onFrame callback on the main thread.
 *
 * Used by the tuner today; the practice screen (chord detection) can reuse it
 * with its own frameSize/hopSize.
 */

export const DEFAULT_FRAME_SIZE = 4096;
export const DEFAULT_HOP_SIZE = 2048;

const WORKLET_URL = "/worklets/frame-processor.js";
const WORKLET_NAME = "frame-processor";

export type AudioSource =
  | { kind: "mic"; deviceId?: string }
  /** Test tone (dev). */
  | { kind: "oscillator"; frequency: number; type?: OscillatorType }
  /** Pre-rendered audio, e.g. a synthesized strum (dev). Loops by default. */
  | {
      kind: "buffer";
      createBuffer: (ctx: BaseAudioContext) => AudioBuffer;
      loop?: boolean;
      /** Also play it through the speakers (self-tests). */
      monitor?: boolean;
      /** Called with the context time the buffer starts at. */
      onStart?: (contextTime: number) => void;
      /** Called when a non-looping buffer finishes. */
      onFinish?: () => void;
    };

/** `endFrame` = context sample index just after the frame's last sample. */
export type FrameCallback = (frame: Float32Array, sampleRate: number, endFrame: number) => void;

export interface PipelineOptions {
  source?: AudioSource;
  frameSize?: number;
  hopSize?: number;
  onFrame: FrameCallback;
  /** Called if the input ends on its own (mic unplugged, permission revoked). */
  onEnded?: () => void;
}

export interface AudioPipeline {
  readonly audioContext: AudioContext;
  readonly sampleRate: number;
  readonly source: AudioSource["kind"];
  /** Capture latency the browser reports for the mic track (ms), or null. */
  readonly inputLatencyMs: number | null;
  /** Only does something for the oscillator source. */
  setOscillatorFrequency(hz: number): void;
  /** Stops the mic tracks, disconnects every node and closes the AudioContext. Safe to call twice. */
  stop(): Promise<void>;
}

export type PipelineErrorCode =
  | "permission-denied"
  | "no-mic"
  | "mic-busy"
  | "insecure-context"
  | "unsupported"
  | "unknown";

export class PipelineError extends Error {
  constructor(
    readonly code: PipelineErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

/** Maps getUserMedia errors to something the UI can show. */
function micError(err: unknown): PipelineError {
  if (err instanceof PipelineError) return err;
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return new PipelineError("permission-denied", "Microphone permission was denied.", err);
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return new PipelineError("no-mic", "No microphone was found.", err);
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return new PipelineError("mic-busy", "The microphone could not be started.", err);
    default:
      return new PipelineError("unknown", err instanceof Error ? err.message : String(err), err);
  }
}

async function getMicStream(deviceId?: string): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new PipelineError("insecure-context", "The microphone needs HTTPS (or localhost).");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new PipelineError("unsupported", "This browser cannot access the microphone.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        // Browser defaults are tuned for speech and distort instrument audio.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    });
  } catch (err) {
    throw micError(err);
  }
}

/**
 * Starts capturing. Call it from a user gesture (click/tap) so the
 * AudioContext is allowed to run.
 */
export async function startPipeline(options: PipelineOptions): Promise<AudioPipeline> {
  const source = options.source ?? { kind: "mic" };
  const frameSize = options.frameSize ?? DEFAULT_FRAME_SIZE;
  const hopSize = options.hopSize ?? DEFAULT_HOP_SIZE;

  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    throw new PipelineError("unsupported", "Web Audio is not available in this browser.");
  }

  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;

  try {
    // Ask for the mic first: on iOS, opening the mic can change the hardware
    // sample rate, so the AudioContext is created afterwards.
    if (source.kind === "mic") stream = await getMicStream(source.deviceId);

    ctx = new AudioContext({ latencyHint: "interactive" });
    if (ctx.state === "suspended") await ctx.resume();

    await ctx.audioWorklet.addModule(WORKLET_URL);

    const worklet = new AudioWorkletNode(ctx, WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { frameSize, hopSize },
    });

    const sampleRate = ctx.sampleRate;
    worklet.port.onmessage = (event: MessageEvent<{ frame: Float32Array; end: number }>) => {
      options.onFrame(event.data.frame, sampleRate, event.data.end);
    };

    let input: AudioNode;
    let oscillator: OscillatorNode | null = null;
    let player: AudioBufferSourceNode | null = null;

    if (source.kind === "mic" && stream) {
      input = ctx.createMediaStreamSource(stream);
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => options.onEnded?.());
      }
    } else if (source.kind === "oscillator") {
      oscillator = new OscillatorNode(ctx, { type: source.type ?? "sine", frequency: source.frequency });
      // Roughly the level of a plucked string, not a full-scale tone.
      const level = new GainNode(ctx, { gain: 0.3 });
      oscillator.connect(level);
      oscillator.start();
      input = level;
    } else if (source.kind === "buffer") {
      player = new AudioBufferSourceNode(ctx, { buffer: source.createBuffer(ctx), loop: source.loop ?? true });
      const startAt = ctx.currentTime + 0.15;
      player.start(startAt);
      source.onStart?.(startAt);
      if (source.onFinish) player.onended = () => source.onFinish?.();
      if (source.monitor) player.connect(ctx.destination);
      input = player;
    } else {
      throw new PipelineError("unknown", "No input source.");
    }

    input.connect(worklet);
    // The worklet writes nothing to its output, so this is silent. Being
    // connected to the destination keeps the node processing in every browser.
    worklet.connect(ctx.destination);

    let stopped = false;
    const audioContext = ctx;
    const mediaStream = stream;
    const reported = (stream?.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number } | undefined)?.latency;

    return {
      audioContext,
      sampleRate,
      source: source.kind,
      inputLatencyMs: typeof reported === "number" && reported > 0 ? reported * 1000 : null,
      setOscillatorFrequency(hz: number) {
        oscillator?.frequency.setValueAtTime(hz, audioContext.currentTime);
      },
      async stop() {
        if (stopped) return;
        stopped = true;
        mediaStream?.getTracks().forEach((t) => t.stop());
        oscillator?.stop();
        player?.stop();
        worklet.port.postMessage("stop");
        worklet.port.onmessage = null;
        worklet.port.close();
        input.disconnect();
        worklet.disconnect();
        if (audioContext.state !== "closed") await audioContext.close();
      },
    };
  } catch (err) {
    stream?.getTracks().forEach((t) => t.stop());
    if (ctx && ctx.state !== "closed") await ctx.close().catch(() => {});
    if (err instanceof PipelineError) throw err;
    throw new PipelineError("unknown", err instanceof Error ? err.message : String(err), err);
  }
}
