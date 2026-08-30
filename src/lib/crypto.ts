import { base64ToBytes, bytesToBase64, sha256Hex, toHex } from "./bytes";

export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportKeyB64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importKeyB64(b64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(b64);
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return crypto.subtle.importKey("raw", copy.buffer, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptBytes(
  data: ArrayBuffer,
  key: CryptoKey,
): Promise<{ ivHex: string; ciphertext: ArrayBuffer; ciphertextHash: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const ciphertextHash = await sha256Hex(ciphertext);
  return { ivHex: toHex(iv), ciphertext, ciphertextHash };
}

export async function decryptBytes(
  ciphertext: ArrayBuffer,
  ivHex: string,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const iv = new Uint8Array(ivHex.length / 2);
  for (let i = 0; i < iv.length; i++) {
    iv[i] = parseInt(ivHex.slice(i * 2, i * 2 + 2), 16);
  }
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}
