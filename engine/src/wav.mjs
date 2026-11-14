/**
 * Read a WAV file into float samples at its own sample rate, so a recording
 * is measured exactly as it was made (the browser's decoder resamples every
 * file to the device rate). PCM 8, 16, 24 and 32 bit, IEEE float 32 and 64
 * bit, and WAVE_FORMAT_EXTENSIBLE. Other formats go through the browser.
 */

/**
 * @typedef {{ sampleRate: number, bitsPerSample: number, format: "pcm" | "float", channels: Float32Array[] }} DecodedWav
 */

/**
 * True when the bytes start like a RIFF/WAVE file.
 * @param {ArrayBuffer} buffer
 */
export function isWav(buffer) {
  if (buffer.byteLength < 12) return false;
  const v = new DataView(buffer);
  return tag(v, 0) === "RIFF" && tag(v, 8) === "WAVE";
}

/**
 * @typedef {{ code: number, channelCount: number, sampleRate: number, bits: number, frameBytes: number, dataStart: number, dataSize: number | null, isFloat: boolean }} WavLayout
 */

/**
 * Where a WAV file's samples are and how they are stored, from its first
 * bytes only (64 KB is plenty), so a long recording can be read in slices.
 * dataSize is null when the header gives none (some recorders write 0 while
 * recording); then the samples run to the end of the file.
 * @param {ArrayBuffer} head the start of the file
 * @returns {WavLayout}
 */
export function wavLayout(head) {
  if (!isWav(head)) throw new Error("This is not a WAV file.");
  const v = new DataView(head);
  let offset = 12;
  /** @type {{ code: number, channelCount: number, sampleRate: number, bits: number, blockAlign: number } | null} */
  let fmt = null;
  /** @type {{ start: number, size: number | null } | null} */
  let data = null;
  while (offset + 8 <= v.byteLength) {
    const id = tag(v, offset);
    const size = v.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (body + 16 > v.byteLength) break;
      let code = v.getUint16(body, true);
      // WAVE_FORMAT_EXTENSIBLE keeps the real format code in its sub-format GUID.
      if (code === 0xfffe && size >= 26 && body + 26 <= v.byteLength) code = v.getUint16(body + 24, true);
      fmt = { code, channelCount: v.getUint16(body + 2, true), sampleRate: v.getUint32(body + 4, true), blockAlign: v.getUint16(body + 12, true), bits: v.getUint16(body + 14, true) };
    } else if (id === "data") {
      data = { start: body, size: size || null };
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!fmt) throw new Error("The WAV file has no format block.");
  if (!data) throw new Error("The WAV file has no audio data.");
  const { code, channelCount, sampleRate, bits } = fmt;
  const isFloat = code === 3;
  if (!(code === 1 || isFloat)) throw new Error("This WAV uses a compressed format (code " + code + "); export it as PCM WAV, or upload MP3, M4A or the original file.");
  if (isFloat ? !(bits === 32 || bits === 64) : !(bits === 8 || bits === 16 || bits === 24 || bits === 32)) throw new Error("Unsupported WAV bit depth: " + bits + ".");
  if (!(channelCount >= 1)) throw new Error("The WAV file has no channels.");
  return { code, channelCount, sampleRate, bits, frameBytes: fmt.blockAlign || (bits / 8) * channelCount, dataStart: data.start, dataSize: data.size, isFloat };
}

/**
 * Float samples from whole frames of sample data (a slice of the data
 * block that starts on a frame boundary; a partial frame at the end is left out).
 * @param {ArrayBuffer} bytes @param {WavLayout} layout @param {number} [maxChannels]
 * @returns {Float32Array[]}
 */
export function decodeWavFrames(bytes, layout, maxChannels = layout.channelCount) {
  const v = new DataView(bytes);
  const { bits, isFloat, frameBytes } = layout;
  const size = bits / 8;
  const frames = Math.floor(v.byteLength / frameBytes);
  const keep = Math.min(layout.channelCount, Math.max(1, maxChannels));
  const channels = Array.from({ length: keep }, () => new Float32Array(frames));
  for (let c = 0; c < keep; c += 1) {
    const out = channels[c];
    let p = c * size;
    for (let n = 0; n < frames; n += 1, p += frameBytes) {
      if (isFloat) out[n] = bits === 32 ? v.getFloat32(p, true) : v.getFloat64(p, true);
      else if (bits === 16) out[n] = v.getInt16(p, true) / 32768;
      else if (bits === 24) {
        const x = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16);
        out[n] = x / 8388608;
      } else if (bits === 32) out[n] = v.getInt32(p, true) / 2147483648;
      else out[n] = (v.getUint8(p) - 128) / 128;
    }
  }
  return channels;
}

/**
 * @param {ArrayBuffer} buffer
 * @param {{ maxChannels?: number }} [options] channels beyond maxChannels are left out
 * @returns {DecodedWav}
 */
export function decodeWav(buffer, options = {}) {
  const layout = wavLayout(buffer);
  const available = buffer.byteLength - layout.dataStart;
  // Some recorders write 0 or a too-large size while recording; use what is there.
  const size = Math.min(layout.dataSize ?? available, available);
  const channels = decodeWavFrames(buffer.slice(layout.dataStart, layout.dataStart + size), layout, options.maxChannels);
  return { sampleRate: layout.sampleRate, bitsPerSample: layout.bits, format: layout.isFloat ? "float" : "pcm", channels };
}

/**
 * Measure a WAV file slice by slice, in constant memory: the header from the
 * first 64 KB, then sliceBytes of samples at a time, each slice decoded and
 * fed to the streaming analyzer. read(start, end) returns those bytes of the
 * file (Blob.slice(start, end).arrayBuffer() in a browser).
 * @param {{ size: number, read: (start: number, end: number) => Promise<ArrayBuffer>, analyzer: (sampleRate: number, channels: number) => { push(c: Float32Array[]): void, finish(): any }, maxChannels?: number, sliceBytes?: number, onProgress?: (done: number, total: number) => void }} o
 */
export async function measureWavFile(o) {
  const layout = wavLayout(await o.read(0, Math.min(o.size, 65536)));
  const end = Math.min(o.size, layout.dataStart + (layout.dataSize ?? o.size));
  const keep = Math.min(layout.channelCount, Math.max(1, o.maxChannels ?? layout.channelCount));
  const analyzer = o.analyzer(layout.sampleRate, keep);
  // Slices hold whole frames, so no sample is split between two slices.
  const slice = Math.max(layout.frameBytes, Math.floor((o.sliceBytes ?? 4 * 1024 * 1024) / layout.frameBytes) * layout.frameBytes);
  for (let at = layout.dataStart; at < end; at += slice) {
    const stop = Math.min(end, at + slice);
    const channels = decodeWavFrames(await o.read(at, stop), layout, keep);
    if (channels[0].length) analyzer.push(channels);
    o.onProgress?.(stop - layout.dataStart, end - layout.dataStart);
  }
  return { analysis: analyzer.finish(), layout };
}

/**
 * A 16-bit PCM WAV file from float samples (used by the tests and to build
 * test tones).
 * @param {Float32Array[]} channels
 * @param {number} sampleRate
 */
export function encodeWav16(channels, sampleRate) {
  const frames = channels[0].length;
  const blockAlign = channels.length * 2;
  const buffer = new ArrayBuffer(44 + frames * blockAlign);
  const v = new DataView(buffer);
  /** @param {number} at @param {string} s */
  const write = (at, s) => { for (let i = 0; i < 4; i += 1) v.setUint8(at + i, s.charCodeAt(i)); };
  write(0, "RIFF"); v.setUint32(4, 36 + frames * blockAlign, true); write(8, "WAVE");
  write(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels.length, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * blockAlign, true); v.setUint16(32, blockAlign, true); v.setUint16(34, 16, true);
  write(36, "data"); v.setUint32(40, frames * blockAlign, true);
  for (let n = 0; n < frames; n += 1) {
    for (let c = 0; c < channels.length; c += 1) {
      const s = Math.max(-1, Math.min(1, channels[c][n]));
      v.setInt16(44 + n * blockAlign + c * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
    }
  }
  return buffer;
}

/**
 * The 44-byte header of a 24-bit PCM WAV file.
 * @param {number} frames @param {number} channelCount @param {number} sampleRate
 */
export function wav24Header(frames, channelCount, sampleRate) {
  const blockAlign = channelCount * 3;
  const buffer = new ArrayBuffer(44);
  const v = new DataView(buffer);
  /** @param {number} at @param {string} s */
  const write = (at, s) => { for (let i = 0; i < 4; i += 1) v.setUint8(at + i, s.charCodeAt(i)); };
  write(0, "RIFF"); v.setUint32(4, 36 + frames * blockAlign, true); write(8, "WAVE");
  write(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channelCount, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * blockAlign, true); v.setUint16(32, blockAlign, true); v.setUint16(34, 24, true);
  write(36, "data"); v.setUint32(40, frames * blockAlign, true);
  return new Uint8Array(buffer);
}

/**
 * Frames [from, to) as interleaved 24-bit PCM, so a long master is written
 * piece by piece instead of as one huge buffer.
 * @param {Float32Array[]} channels @param {number} from @param {number} to
 */
export function pcm24(channels, from, to) {
  const out = new Uint8Array((to - from) * channels.length * 3);
  let at = 0;
  for (let n = from; n < to; n += 1) {
    for (let c = 0; c < channels.length; c += 1) {
      const s = Math.max(-1, Math.min(1, channels[c][n]));
      const v = s < 0 ? Math.round(s * 8388608) : Math.round(s * 8388607);
      out[at] = v & 255; out[at + 1] = (v >> 8) & 255; out[at + 2] = (v >> 16) & 255;
      at += 3;
    }
  }
  return out;
}

/**
 * A whole 24-bit PCM WAV file (short masters and tests).
 * @param {Float32Array[]} channels @param {number} sampleRate
 */
export function encodeWav24(channels, sampleRate) {
  const frames = channels[0].length;
  const out = new Uint8Array(44 + frames * channels.length * 3);
  out.set(wav24Header(frames, channels.length, sampleRate));
  out.set(pcm24(channels, 0, frames), 44);
  return out.buffer;
}

/** @param {DataView} v @param {number} at */
function tag(v, at) {
  return String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
}
