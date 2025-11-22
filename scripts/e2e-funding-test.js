const fetch = globalThis.fetch || require('node-fetch');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'bank.db');
const db = new Database(dbPath);

async function trpcCall(token, procedure, input) {
  const url = 'http://localhost:3001/api/trpc/' + procedure;
  const body = JSON.stringify({ input });
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['cookie'] = `session=${token}`;

  const res = await fetch(url, { method: 'POST', headers, body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  return { status: res.status, body: json, headers: res.headers };
}

async function main() {
  try {
    // Use existing user (id=1) if present, else create one
    let user = db.prepare('SELECT id, email FROM users LIMIT 1').get();
    if (!user) {
      console.log('No user found. Creating test user...');
      db.prepare(`INSERT INTO users (email, password, first_name, last_name, phone_number, date_of_birth, ssn, address, city, state, zip_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('e2e@example.com', 'x', 'E2E', 'User', '+10000000000', '1990-01-01', '000000000', '1 Test St', 'Testville', 'NY', '12345');
      user = db.prepare('SELECT id, email FROM users WHERE email = ?').get('e2e@example.com');
      console.log('Created user id', user.id);
    } else {
      console.log('Using existing user', user.email, 'id', user.id);
    }

    const jwtSecret = process.env.JWT_SECRET || 'temporary-secret-for-interview';
    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    // Insert session record
    db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);
    console.log('Inserted session for user', user.id);

    // Ensure account exists; call account.getAccounts
    let res = await trpcCall(token, 'account.getAccounts', undefined);
    let accounts = res.body?.result?.data;
    if (!accounts || accounts.length === 0) {
      console.log('No accounts for user, creating one...');
      res = await trpcCall(token, 'account.createAccount', { accountType: 'checking' });
      console.log('createAccount response:', res.status, res.body?.result || res.body);
      res = await trpcCall(token, 'account.getAccounts', undefined);
      accounts = res.body?.result?.data;
    }

    const accountId = accounts[0].id;
    console.log('Using account id', accountId);

    // Get transactions before
    res = await trpcCall(token, 'account.getTransactions', { accountId });
    const before = res.body?.result?.data || [];
    console.log('Transactions before:', before.length);

    // Fund account 3 times
    for (let i = 1; i <= 3; i++) {
      console.log('Funding attempt', i);
      res = await trpcCall(token, 'account.fundAccount', {
        accountId,
        amount: (1.23 * i).toFixed(2),
        fundingSource: { type: 'card', accountNumber: '4111111111111111' },
      });
      console.log('fundAccount response status', res.status, 'body:', res.body?.result?.data || res.body);
    }

    // Fetch transactions after
    res = await trpcCall(token, 'account.getTransactions', { accountId });
    const after = res.body?.result?.data || [];
    console.log('Transactions after:', after.length);

    // Print last 5 transactions
    console.log('Last transactions:');
    after.slice(0, 10).forEach((t) => console.log(t.id, t.type, t.amount, t.processedAt || t.createdAt));

    // Check if number increased by 3
    const diff = after.length - before.length;
    if (diff >= 3) {
      console.log('E2E funding test SUCCESS: found', diff, 'new transactions');
      process.exit(0);
    } else {
      console.error('E2E funding test FAILURE: expected +3 transactions, found +', diff);
      process.exit(2);
    }
  } catch (e) {
    console.error('E2E test error:', e);
    process.exit(1);
  }
}

main();
