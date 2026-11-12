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
 * @param {ArrayBuffer} buffer
 * @param {{ maxChannels?: number }} [options] channels beyond maxChannels are left out
 * @returns {DecodedWav}
 */
export function decodeWav(buffer, options = {}) {
  if (!isWav(buffer)) throw new Error("This is not a WAV file.");
  const v = new DataView(buffer);
  let offset = 12;
  /** @type {{ code: number, channelCount: number, sampleRate: number, bits: number, blockAlign: number } | null} */
  let fmt = null;
  /** @type {{ start: number, size: number } | null} */
  let data = null;
  while (offset + 8 <= v.byteLength) {
    const id = tag(v, offset);
    const size = v.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      let code = v.getUint16(body, true);
      // WAVE_FORMAT_EXTENSIBLE keeps the real format code in its sub-format GUID.
      if (code === 0xfffe && size >= 26) code = v.getUint16(body + 24, true);
      fmt = { code, channelCount: v.getUint16(body + 2, true), sampleRate: v.getUint32(body + 4, true), blockAlign: v.getUint16(body + 12, true), bits: v.getUint16(body + 14, true) };
    } else if (id === "data") {
      // Some recorders write 0 or a too-large size while recording; use what is there.
      data = { start: body, size: Math.min(size || v.byteLength - body, v.byteLength - body) };
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
  const bytes = bits / 8;
  const frameBytes = fmt.blockAlign || bytes * channelCount;
  const frames = Math.floor(data.size / frameBytes);
  const keep = Math.min(channelCount, Math.max(1, options.maxChannels ?? channelCount));
  const channels = Array.from({ length: keep }, () => new Float32Array(frames));
  for (let c = 0; c < keep; c += 1) {
    const out = channels[c];
    let p = data.start + c * bytes;
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
  return { sampleRate, bitsPerSample: bits, format: isFloat ? "float" : "pcm", channels };
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

/** @param {DataView} v @param {number} at */
function tag(v, at) {
  return String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
}
