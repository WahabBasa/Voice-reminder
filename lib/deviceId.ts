import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Per-install device identity (OLD-74).
 *
 * There are no accounts, so the backend scopes every reminder to the install
 * that created it. This is that install's id: generated once on first use,
 * persisted in AsyncStorage, and sent with every Convex call that reads or
 * writes reminders. Reinstalling the app mints a new id — the old rows become
 * unreachable, which is the same outcome as the local reminder list being wiped.
 */
const DEVICE_ID_KEY = "@device_id";

let cachedDeviceId: string | null = null;
let loadInFlight: Promise<string> | null = null;

/**
 * 32 hex chars (128 bits). Uses WebCrypto when the runtime exposes it and
 * falls back to Math.random otherwise — Hermes has no guaranteed getRandomValues
 * and pulling in a native crypto module would mean a new native build.
 */
function generateDeviceId(): string {
  const bytes = new Uint8Array(16);
  const webCrypto = (globalThis as any)?.crypto;
  if (typeof webCrypto?.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * The stable id for this install, creating and persisting one on first call.
 * Concurrent callers share a single read so two callers can't mint two ids.
 *
 * A storage failure never throws: the caller gets an in-memory id for the rest
 * of the session, so reminder creation still works and the rows are simply
 * scoped to an id that won't survive a restart.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  if (loadInFlight) return loadInFlight;

  loadInFlight = (async () => {
    try {
      const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (stored) {
        cachedDeviceId = stored;
        return stored;
      }
    } catch (error) {
      console.log("[VR] deviceId: read failed, minting a session id:", error);
    }

    const generated = generateDeviceId();
    try {
      await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
    } catch (error) {
      console.log("[VR] deviceId: persist failed, id lasts this session only:", error);
    }
    cachedDeviceId = generated;
    return generated;
  })();

  try {
    return await loadInFlight;
  } finally {
    loadInFlight = null;
  }
}

/** The id if it has already been loaded, else null. Never touches storage. */
export function getCachedDeviceId(): string | null {
  return cachedDeviceId;
}
