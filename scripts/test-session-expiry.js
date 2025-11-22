const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'bank.db');
const db = new Database(dbPath);

function ensureUser() {
  const u = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (u && u.id) return u.id;
  const stmt = db.prepare(
    `INSERT INTO users (email, password, first_name, last_name, phone_number, date_of_birth, ssn, address, city, state, zip_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    'test-expiry@example.com',
    'placeholder',
    'Expiry',
    'Tester',
    '+10000000000',
    '1990-01-01',
    '000000000',
    '1 Test St',
    'Testville',
    'NY',
    '12345'
  );
  const newU = db.prepare('SELECT id FROM users WHERE email = ?').get('test-expiry@example.com');
  return newU.id;
}

(async function main() {
  try {
    const userId = ensureUser();

    const token = 'test-short-' + Math.random().toString(36).slice(2);
    const expiresAt = new Date(Date.now() + 30 * 1000).toISOString(); // 30s from now

    db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expiresAt);

    console.log('Inserted session:', token);
    console.log('Expires at:', expiresAt);

    const session = db.prepare('SELECT token, expires_at FROM sessions WHERE token = ?').get(token);
    if (!session) {
      console.error('Failed to read back inserted session');
      process.exit(2);
    }

    const leewaySeconds = parseInt(process.env.SESSION_LEEWAY_SECONDS || '60', 10);
    const now = Date.now();
    const exp = new Date(session.expires_at).getTime();

    console.log('SESSION_LEEWAY_SECONDS =', leewaySeconds);

    if (exp > now + leewaySeconds * 1000) {
      console.log('Session is considered VALID (expires beyond now + leeway)');
    } else {
      console.log('Session is within leeway or expired; deleting...');
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      console.log('Deleted session', token);
    }

    console.log('\nCurrent sessions (first 5):');
    const rows = db.prepare('SELECT id, user_id, token, expires_at FROM sessions ORDER BY id DESC LIMIT 5').all();
    rows.forEach((r) => console.log(r));

    db.close();
  } catch (e) {
    console.error('Error during test:', e);
    process.exit(1);
  }
})();
