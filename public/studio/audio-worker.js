// Measures a recording off the main thread so the page stays responsive on
// phones. WAV files are read here at their own sample rate; other formats are
// decoded by the page (only it has the browser's audio decoder) and sent as samples.
import { analyzeRecording } from "./engine/loudness.mjs";
import { decodeWav } from "./engine/wav.mjs";

self.onmessage = (event) => {
  try {
    const message = event.data;
    if (message.kind === "wav") {
      const wav = decodeWav(message.buffer, { maxChannels: 2 });
      self.postMessage({ analysis: analyzeRecording(wav.channels, wav.sampleRate), nativeRate: true, bits: wav.bitsPerSample });
    } else {
      self.postMessage({ analysis: analyzeRecording(message.channels, message.sampleRate) });
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
