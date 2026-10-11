/**
 * Speak-twice alarm wav for a reminder whose "keeps ringing" switch is off.
 *
 * AlarmKit has no "ring once": it loops the named sound file for as long as the
 * alarm rings, so what a ringing alarm sounds like is decided by what is inside
 * the file. The server ships one wav per reminder, shaped to loop:
 * `[line][2s gap]` repeated in whole passes out to ~28s (convex/helpers.ts
 * buildAlarmWav). Played by AlarmKit that is the line every few seconds until
 * the user answers — the "keeps ringing" behaviour.
 *
 * With the switch off the alarm should say the line twice and go quiet. This
 * module derives that file on the device from the same server wav: the first
 * two passes, then silence out to SPEAK_TWICE_WAV_SECONDS. AlarmKit still loops
 * it (nothing can stop an AlarmKit ring but the user), so the closest it gets
 * is "the line twice, then ~20s of quiet" per loop instead of non-stop speech.
 *
 * Deriving it here rather than storing a second file on the server means no
 * extra synthesis, no new Convex field for older builds to ignore, and a toggle
 * change needs only a re-schedule, not a regeneration. The server wav's shape
 * is detected, not assumed: a pass boundary is accepted only when the bytes
 * after it are an exact copy of the bytes before it.
 */

/** Length of the speak-twice file; iOS rejects alarm sounds from 30s up. */
export const SPEAK_TWICE_WAV_SECONDS = 29;

/**
 * Shortest run of digital silence taken as the gap between passes. The server
 * inserts exactly 2s (ALARM_WAV_GAP_SECONDS); the margin covers rounding.
 */
const MIN_PASS_GAP_SECONDS = 1.5;

type PcmLayout = { dataOffset: number; dataLength: number; sampleRate: number };

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

/** Locate the PCM payload of a mono 16-bit PCM wav, or null for anything else. */
function readPcmLayout(wav: Uint8Array): PcmLayout | null {
  if (wav.length < 44) return null;
  if (readAscii(wav, 0, 4) !== "RIFF" || readAscii(wav, 8, 4) !== "WAVE") return null;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  let sampleRate = 0;
  let formatOk = false;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = readAscii(wav, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= wav.length) {
      const audioFormat = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      const bits = view.getUint16(body + 14, true);
      formatOk = audioFormat === 1 && channels === 1 && bits === 16 && sampleRate > 0;
    } else if (id === "data") {
      if (!formatOk) return null;
      const dataLength = Math.min(size, wav.length - body);
      return { dataOffset: body, dataLength: dataLength - (dataLength % 2), sampleRate };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

function buildPcmWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) wav[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

function bytesEqual(data: Uint8Array, a: number, b: number, length: number): boolean {
  for (let i = 0; i < length; i++) {
    if (data[a + i] !== data[b + i]) return false;
  }
  return true;
}

/**
 * Bytes in one `[line][gap]` pass of the looping server wav: the first offset
 * whose remainder starts with an exact copy of what came before it, found at
 * the end of a long run of silence. Null when the file holds a single pass.
 */
function findPassBytes(pcm: Uint8Array, sampleRate: number): number | null {
  const samples = pcm.length / 2;
  const isZero = (s: number) => pcm[2 * s] === 0 && pcm[2 * s + 1] === 0;

  let lead = 0;
  while (lead < samples && isZero(lead)) lead++;
  if (lead >= samples) return null;

  const minRun = Math.ceil(MIN_PASS_GAP_SECONDS * sampleRate);
  let run = 0;
  for (let s = lead; s < samples; s++) {
    if (isZero(s)) {
      run++;
      continue;
    }
    if (run >= minRun) {
      // Pass two's first sound sits `lead` samples into it, like pass one's.
      const passBytes = (s - lead) * 2;
      const compare = Math.min(passBytes, pcm.length - passBytes);
      if (bytesEqual(pcm, 0, passBytes, compare)) return passBytes;
    }
    run = 0;
  }
  return null;
}

/**
 * The speak-twice wav derived from the server's looping wav: two passes of the
 * line, then silence out to SPEAK_TWICE_WAV_SECONDS. Null when the input is not
 * a mono 16-bit PCM wav, is silent, or its line is too long to say twice
 * inside the limit — the caller then keeps the server wav as it is.
 */
export function shapeSpeakTwiceWav(wav: Uint8Array): Uint8Array | null {
  const layout = readPcmLayout(wav);
  if (!layout || layout.dataLength === 0) return null;
  const pcm = wav.subarray(layout.dataOffset, layout.dataOffset + layout.dataLength);

  const maxBytes = SPEAK_TWICE_WAV_SECONDS * layout.sampleRate * 2;
  let twiceBytes: number;
  let source: Uint8Array;
  const passBytes = findPassBytes(pcm, layout.sampleRate);
  if (passBytes !== null) {
    twiceBytes = Math.min(2 * passBytes, pcm.length);
    source = pcm.subarray(0, twiceBytes);
  } else {
    // One pass (or a bare line): say it, then say it again, if that fits.
    let hasSound = false;
    for (let i = 0; i < pcm.length; i++) {
      if (pcm[i] !== 0) {
        hasSound = true;
        break;
      }
    }
    if (!hasSound || 2 * pcm.length > maxBytes) return null;
    twiceBytes = 2 * pcm.length;
    source = new Uint8Array(twiceBytes);
    source.set(pcm, 0);
    source.set(pcm, pcm.length);
  }

  const out = new Uint8Array(Math.max(twiceBytes, maxBytes));
  out.set(source, 0);
  return buildPcmWav(out, layout.sampleRate);
}

// ─── base64 (expo-file-system reads and writes binary only as base64) ───────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_INDEX[B64[i]] = i;

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_INDEX[clean[i]];
    const b = B64_INDEX[clean[i + 1]] ?? 0;
    const c = B64_INDEX[clean[i + 2]];
    const d = B64_INDEX[clean[i + 3]];
    const n = (a << 18) | (b << 12) | ((c ?? 0) << 6) | (d ?? 0);
    out[o++] = (n >> 16) & 255;
    if (c !== undefined) out[o++] = (n >> 8) & 255;
    if (d !== undefined) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    chunk +=
      B64[(n >> 18) & 63] +
      B64[(n >> 12) & 63] +
      (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") +
      (i + 2 < bytes.length ? B64[n & 63] : "=");
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = "";
    }
  }
  parts.push(chunk);
  return parts.join("");
}
