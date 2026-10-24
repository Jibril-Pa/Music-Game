/**
 * Collects mono input samples into overlapping fixed-size frames and posts
 * each full frame to the main thread as { frame: Float32Array, end: number },
 * where `end` is the context sample index just after the frame's last sample
 * (used to time-stamp onsets precisely).
 *
 * processorOptions: { frameSize = 4096, hopSize = 2048 }
 * Send the string "stop" on the port to end processing.
 */
class FrameProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.frameSize = opts.frameSize || 4096;
    this.hopSize = Math.min(opts.hopSize || 2048, this.frameSize);
    this.buffer = new Float32Array(this.frameSize);
    this.filled = 0;
    this.running = true;
    this.port.onmessage = (event) => {
      if (event.data === "stop") this.running = false;
    };
  }

  process(inputs) {
    if (!this.running) return false;

    const input = inputs[0];
    // No input connected yet (or it went away): keep the node alive.
    if (!input || input.length === 0) return true;

    const channels = input.length;
    const blockSize = input[0].length;

    for (let i = 0; i < blockSize; i++) {
      let sample = input[0][i];
      if (channels > 1) {
        for (let c = 1; c < channels; c++) sample += input[c][i];
        sample /= channels;
      }

      this.buffer[this.filled++] = sample;

      if (this.filled === this.frameSize) {
        // Copy out and transfer ownership so the main thread gets it for free.
        const frame = this.buffer.slice();
        // eslint-disable-next-line no-undef -- currentFrame is an AudioWorkletGlobalScope global
        this.port.postMessage({ frame, end: currentFrame + i + 1 }, [frame.buffer]);
        // Keep the last (frameSize - hopSize) samples for the next frame.
        this.buffer.copyWithin(0, this.hopSize);
        this.filled = this.frameSize - this.hopSize;
      }
    }

    return true;
  }
}

registerProcessor("frame-processor", FrameProcessor);
