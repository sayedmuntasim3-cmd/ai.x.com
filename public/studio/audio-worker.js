// Measures a recording off the main thread, in constant memory, so a phone
// never holds an hour of audio at once.
//   { kind: "wav-file", file }        the worker reads the WAV itself, slice by slice, at its own sample rate
//   { kind: "pcm-start", sampleRate, channels }, { kind: "pcm-chunk", channels }..., { kind: "pcm-end", approximate }
//                                     other formats: the page decodes (only it has the browser's decoder) and sends pieces
// Replies: { progress } while reading, { ack } after each pcm-chunk, then { analysis, ... } or { error }.
import { createRecordingAnalyzer } from "./engine/loudness.mjs";
import { measureWavFile } from "./engine/wav.mjs";

/** @type {ReturnType<typeof createRecordingAnalyzer> | null} */
let pcm = null;

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.kind === "wav-file") {
      const file = message.file;
      const { analysis, layout } = await measureWavFile({
        size: file.size,
        read: (start, end) => file.slice(start, end).arrayBuffer(),
        analyzer: (rate, channels) => createRecordingAnalyzer(rate, channels),
        maxChannels: 2,
        onProgress: (done, total) => self.postMessage({ progress: total ? done / total : 1 }),
      });
      self.postMessage({ analysis, nativeRate: true, bits: layout.bits });
    } else if (message.kind === "pcm-start") {
      pcm = createRecordingAnalyzer(message.sampleRate, message.channels);
    } else if (message.kind === "pcm-chunk") {
      if (!pcm) throw new Error("pcm-chunk before pcm-start");
      pcm.push(message.channels);
      // The page waits for this before sending more, so pieces never pile up in memory.
      self.postMessage({ ack: true });
    } else if (message.kind === "pcm-end") {
      if (!pcm) throw new Error("pcm-end before pcm-start");
      const analysis = pcm.finish();
      pcm = null;
      self.postMessage({ analysis, nativeRate: false, bits: null, approximate: Boolean(message.approximate) });
    }
  } catch (error) {
    pcm = null;
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
