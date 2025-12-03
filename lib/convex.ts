import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";

export async function readFileAsBase64(uri: string): Promise<string> {
  const base64 = await readAsStringAsync(uri, {
    encoding: EncodingType.Base64,
  });
  return base64;
}
