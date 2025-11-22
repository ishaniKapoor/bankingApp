import crypto from "crypto";

const KEY_ENV = "SSN_ENC_KEY"; // must be 32 bytes (base64 or hex)

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) throw new Error(`Missing ${KEY_ENV} in environment`);

  // Try base64, then hex, then raw utf-8
  try {
    return Buffer.from(raw, "base64");
  } catch (e) {
    // fallback
  }

  try {
    return Buffer.from(raw, "hex");
  } catch (e) {
    // fallback
  }

  const buf = Buffer.from(raw, "utf8");
  if (buf.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes (AES-256)`);
  }
  return buf;
}

// Stored format: base64(iv||authTag||ciphertext)
export function encryptSSN(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([iv, tag, ciphertext]);
  return out.toString("base64");
}

export function decryptSSN(data: string): string {
  const key = getKey();
  const buf = Buffer.from(data, "base64");
  if (buf.length < 12 + 16) throw new Error("Invalid encrypted data");
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const ciphertext = buf.slice(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

export default { encryptSSN, decryptSSN };
