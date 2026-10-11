import {
  SPEAK_TWICE_WAV_SECONDS,
  base64ToBytes,
  bytesToBase64,
  shapeSpeakTwiceWav,
} from "../../lib/alarmWavCadence";
import { buildAlarmWav, ALARM_WAV_GAP_SECONDS } from "../../convex/helpers";

const RATE = 22050;

/** A spoken-line stand-in: `seconds` of non-silent PCM with a little lead-in silence. */
function fakeLine(seconds: number, leadSilenceSamples = 0, seed = 1): Uint8Array {
  const samples = Math.round(seconds * RATE);
  const pcm = new Uint8Array(samples * 2);
  for (let s = leadSilenceSamples; s < samples; s++) {
    const v = ((s * 37 + seed) % 2000) + 1; // never zero
    pcm[2 * s] = v & 255;
    pcm[2 * s + 1] = (v >> 8) & 255;
  }
  return pcm;
}

function pcmOf(wav: Uint8Array): Uint8Array {
  return wav.subarray(44);
}

function sampleRateOf(wav: Uint8Array): number {
  return new DataView(wav.buffer, wav.byteOffset).getUint32(24, true);
}

describe("shapeSpeakTwiceWav", () => {
  it("keeps two passes of the server's looping wav and pads the rest with silence", () => {
    const line = fakeLine(4, 300);
    const serverWav = buildAlarmWav(line, RATE); // 4 passes of [4s line][2s gap]
    const shaped = shapeSpeakTwiceWav(serverWav)!;

    expect(shaped).not.toBeNull();
    expect(sampleRateOf(shaped)).toBe(RATE);
    const pcm = pcmOf(shaped);
    expect(pcm.length).toBe(SPEAK_TWICE_WAV_SECONDS * RATE * 2);

    const passBytes = line.length + ALARM_WAV_GAP_SECONDS * RATE * 2;
    // Pass one and pass two are the line, exactly as the server laid them out.
    expect(Array.from(pcm.subarray(0, line.length))).toEqual(Array.from(line));
    expect(Array.from(pcm.subarray(passBytes, passBytes + line.length))).toEqual(
      Array.from(line)
    );
    // Nothing is spoken after the second pass.
    expect(pcm.subarray(2 * passBytes).every((b) => b === 0)).toBe(true);
  });

  it("is not fooled by a long pause inside the line", () => {
    // [2s sound][1.8s digital silence][2s sound] — a pause longer than the
    // gap detector's floor, but what follows it is not a copy of the start.
    const a = fakeLine(2, 0, 1);
    const b = fakeLine(2, 0, 7);
    const pause = new Uint8Array(Math.round(1.8 * RATE) * 2);
    const line = new Uint8Array(a.length + pause.length + b.length);
    line.set(a, 0);
    line.set(pause, a.length);
    line.set(b, a.length + pause.length);

    const shaped = shapeSpeakTwiceWav(buildAlarmWav(line, RATE))!;
    const pcm = pcmOf(shaped);
    const passBytes = line.length + ALARM_WAV_GAP_SECONDS * RATE * 2;

    expect(Array.from(pcm.subarray(0, line.length))).toEqual(Array.from(line));
    expect(Array.from(pcm.subarray(passBytes, passBytes + line.length))).toEqual(
      Array.from(line)
    );
    expect(pcm.subarray(2 * passBytes).every((x) => x === 0)).toBe(true);
  });

  it("keeps a two-pass wav whole and pads it out to the speak-twice length", () => {
    const line = fakeLine(10);
    const serverWav = buildAlarmWav(line, RATE); // 10s + 2s gap = 2 passes in 28s
    const pcm = pcmOf(shapeSpeakTwiceWav(serverWav)!);
    expect(pcm.length).toBe(SPEAK_TWICE_WAV_SECONDS * RATE * 2);
    expect(Array.from(pcm.subarray(0, 24 * RATE * 2))).toEqual(
      Array.from(pcmOf(serverWav).subarray(0, 24 * RATE * 2))
    );
    expect(pcm.subarray(24 * RATE * 2).every((b) => b === 0)).toBe(true);
  });

  it("says a bare line (no gap) twice back to back when that fits", () => {
    // A bare line (no gap at all) is doubled back to back.
    const bare = fakeLine(5);
    const header = buildAlarmWav(fakeLine(27), RATE).subarray(0, 44).slice();
    new DataView(header.buffer).setUint32(40, bare.length, true);
    const bareWav = new Uint8Array(44 + bare.length);
    bareWav.set(header, 0);
    bareWav.set(bare, 44);
    const doubled = pcmOf(shapeSpeakTwiceWav(bareWav)!);
    expect(Array.from(doubled.subarray(bare.length, 2 * bare.length))).toEqual(
      Array.from(bare)
    );
  });

  it("returns null when the line is too long to say twice", () => {
    expect(shapeSpeakTwiceWav(buildAlarmWav(fakeLine(20), RATE))).toBeNull();
  });

  it("returns null for anything but a mono 16-bit PCM wav", () => {
    expect(shapeSpeakTwiceWav(new Uint8Array(10))).toBeNull();
    const notRiff = buildAlarmWav(fakeLine(3), RATE).slice();
    notRiff[0] = 0x58;
    expect(shapeSpeakTwiceWav(notRiff)).toBeNull();
    const stereo = buildAlarmWav(fakeLine(3), RATE).slice();
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(shapeSpeakTwiceWav(stereo)).toBeNull();
  });

  it("returns null for a silent wav", () => {
    const silent = buildAlarmWav(new Uint8Array(RATE * 2), RATE);
    expect(shapeSpeakTwiceWav(silent)).toBeNull();
  });
});

describe("base64 codec", () => {
  it("round-trips every tail length", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 100, 9001]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 97) & 255);
      const encoded = bytesToBase64(bytes);
      expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
      expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes));
    }
  });

  it("ignores line breaks in its input", () => {
    expect(Array.from(base64ToBytes("AAEC\nAw=="))).toEqual([0, 1, 2, 3]);
  });
});
