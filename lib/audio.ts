import { Audio } from "expo-av";

export type PermissionStatus = "granted" | "denied" | "undetermined";

let recording: Audio.Recording | null = null;

export async function requestMicrophonePermission(): Promise<PermissionStatus> {
  const { status } = await Audio.requestPermissionsAsync();
  return status as PermissionStatus;
}

export async function getMicrophonePermission(): Promise<PermissionStatus> {
  const { status } = await Audio.getPermissionsAsync();
  return status as PermissionStatus;
}

export async function startRecording(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording: newRecording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  recording = newRecording;
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
