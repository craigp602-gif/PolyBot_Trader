import { signAsync } from "@noble/ed25519";

function bytesToB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function decodeSecret(secret: string): Uint8Array {
  const cleaned = secret.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(pad);
  } catch {
    throw new Error("That secret is not valid base64. Paste the key from the Polymarket US developer page.");
  }
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  const seed = raw.length >= 32 ? raw.slice(0, 32) : raw;
  if (seed.length !== 32) {
    throw new Error("The secret must decode to at least 32 bytes.");
  }
  return seed;
}

export async function signPolymarket(input: {
  secret: string;
  method: "GET" | "POST";
  path: string;
}): Promise<{ timestamp: string; signature: string }> {
  const seed = decodeSecret(input.secret);
  const timestamp = String(Date.now());
  const message = new TextEncoder().encode(`${timestamp}${input.method}${input.path}`);
  const sig = await signAsync(message, seed);
  return { timestamp, signature: bytesToB64(sig) };
}
