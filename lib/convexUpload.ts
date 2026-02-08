import * as FileSystem from "expo-file-system/legacy";

/**
 * Upload a recording file to Convex Storage using binary upload.
 * 
 * @param uploadUrl - The upload URL from generateAudioUploadUrl
 * @param audioUri - The local file URI of the recording
 * @returns Object with storageId
 */
export async function uploadRecordingToConvex(
  uploadUrl: string,
  audioUri: string
): Promise<{ storageId: string }> {
  const result = await FileSystem.uploadAsync(uploadUrl, audioUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": "audio/mp4",
    },
  });

  if (result.status !== 200) {
    throw new Error(
      `Upload failed with status ${result.status}: ${result.body?.slice(0, 200) || "No response body"}`
    );
  }

  try {
    const parsed = JSON.parse(result.body);
    if (!parsed.storageId) {
      throw new Error(`Response missing storageId: ${result.body?.slice(0, 200)}`);
    }
    return { storageId: parsed.storageId };
  } catch (e) {
    throw new Error(
      `Failed to parse upload response (status ${result.status}): ${result.body?.slice(0, 200)}`
    );
  }
}
