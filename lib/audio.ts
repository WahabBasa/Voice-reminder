import { Audio } from "expo-av";

export type PermissionStatus = "granted" | "denied" | "undetermined";

let recording: Audio.Recording | null = null;
let isRecordingPreparing = false;

export async function requestMicrophonePermission(): Promise<PermissionStatus> {
  const { status } = await Audio.requestPermissionsAsync();
  return status as PermissionStatus;
}

export async function getMicrophonePermission(): Promise<PermissionStatus> {
  const { status } = await Audio.getPermissionsAsync();
  return status as PermissionStatus;
}

export async function startRecording(): Promise<void> {
  // Prevent double-tap race condition
  if (isRecordingPreparing) {
    console.log("[VR] Recording already preparing, ignoring duplicate call");
    return;
  }

  // Clean up any existing recording first
  if (recording) {
    console.log("[VR] Cleaning up existing recording before starting new one");
    try {
      await recording.stopAndUnloadAsync();
    } catch (e) {
      console.log("[VR] Error cleaning up previous recording:", e);
    }
    recording = null;
  }

  isRecordingPreparing = true;

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording: newRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recording = newRecording;
  } finally {
    isRecordingPreparing = false;
  }
}

export async function pauseRecording(): Promise<void> {
  if (!recording) return;
  await recording.pauseAsync();
}

export async function resumeRecording(): Promise<void> {
  if (!recording) return;
  await recording.startAsync();
}

export async function stopRecording(): Promise<string | null> {
  if (!recording) return null;

  await recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
  });

  const uri = recording.getURI();
  recording = null;
  return uri;
}

export function getRecording(): Audio.Recording | null {
  return recording;
}

let currentSound: Audio.Sound | null = null;

export async function playAudio(uri: string, waitForFinish = false): Promise<void> {
  console.log(`[VR] playAudio called with uri: ${uri}`);

  // Stop any currently playing sound
  if (currentSound) {
    console.log("[VR] Stopping previous sound");
    try {
      await currentSound.unloadAsync();
    } catch (e) {
      console.log("[VR] Error unloading previous sound:", e);
    }
    currentSound = null;
  }

  console.log("[VR] Setting audio mode...");
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
  });

  console.log("[VR] Creating sound object...");
  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true, volume: 1.0 }
  );
  currentSound = sound;
  console.log("[VR] Sound created and playing");

  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        console.log("[VR] Audio playback finished");
        sound.unloadAsync();
        currentSound = null;
        resolve();
      }
    });
    if (!waitForFinish) {
      resolve();
    }
  });
}

/**
 * Optimized function for playing audio multiple times back-to-back.
 * Preloads the sound once and replays with minimal gap between repeats.
 */
export async function playAudioRepeated(uri: string, repeatCount: number): Promise<void> {
  console.log(`[VR] playAudioRepeated called, repeats: ${repeatCount}`);

  // Stop any currently playing sound
  if (currentSound) {
    try {
      await currentSound.unloadAsync();
    } catch (e) {
      console.log("[VR] Error unloading previous sound:", e);
    }
    currentSound = null;
  }

  // Set audio mode once
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
  });

  // Create sound once
  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: false, volume: 1.0 }
  );
  currentSound = sound;

  // Play the sound repeatCount times
  for (let i = 0; i < repeatCount; i++) {
    // Rewind to start
    await sound.setPositionAsync(0);

    // Play and wait for finish
    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          resolve();
        }
      });
      sound.playAsync();
    });

    // Tiny gap between repeats (only if not the last one)
    if (i < repeatCount - 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  // Cleanup
  await sound.unloadAsync();
  currentSound = null;
  console.log("[VR] Audio playback completed all repeats");
}
