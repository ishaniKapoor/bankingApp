// Run from project root: `node scripts/migrate-ssn-encrypt.js`
// WARNING: ensure SSN_ENC_KEY is set in environment before running.
const Database = require("better-sqlite3");
const crypto = require("crypto");

function getKey() {
  const raw = process.env.SSN_ENC_KEY;
  if (!raw) throw new Error("Missing SSN_ENC_KEY in environment");
  // Try base64
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch (e) {}
  // Try hex
  try {
    const b = Buffer.from(raw, "hex");
    if (b.length === 32) return b;
  } catch (e) {}
  // Raw utf8
  const b = Buffer.from(raw, "utf8");
  if (b.length !== 32) throw new Error("SSN_ENC_KEY must decode to 32 bytes");
  return b;
}

function encryptSSN(plain) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([iv, tag, ciphertext]);
  return out.toString("base64");
}

try {
  const db = new Database("bank.db");
  const select = db.prepare("SELECT id, ssn FROM users");
  const update = db.prepare("UPDATE users SET ssn = ? WHERE id = ?");
  const all = select.all();
  for (const u of all) {
    const ssn = u.ssn;
    if (typeof ssn === "string" && /^\d{9}$/.test(ssn)) {
      const encrypted = encryptSSN(ssn);
      update.run(encrypted, u.id);
      console.log(`Updated user ${u.id}`);
    } else {
      console.log(`Skipping user ${u.id} (already encrypted or missing or not plaintext)`);
    }
  }
  console.log("Migration complete");
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
