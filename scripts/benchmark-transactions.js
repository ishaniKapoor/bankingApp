const Database = require('better-sqlite3');
const path = require('path');
const { performance } = require('perf_hooks');

const dbPath = path.join(__dirname, '..', 'bank.db');
const db = new Database(dbPath);

const TARGET_COUNT = parseInt(process.env.BENCH_TXNS || '2000', 10);

function ensureUserAndAccount() {
  let user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) {
    db.prepare(`INSERT INTO users (email, password, first_name, last_name, phone_number, date_of_birth, ssn, address, city, state, zip_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('bench@example.com', 'x', 'Bench', 'User', '+10000000000', '1990-01-01', '000000000', '1 Test St', 'Testville', 'NY', '12345');
    user = db.prepare('SELECT id FROM users WHERE email = ?').get('bench@example.com');
  }
  const userId = user.id;

  let account = db.prepare('SELECT id FROM accounts WHERE user_id = ? LIMIT 1').get(userId);
  if (!account) {
    db.prepare('INSERT INTO accounts (user_id, account_number, account_type, balance, status) VALUES (?, ?, ?, ?, ?)')
      .run(userId, '0000000002', 'checking', 0, 'active');
    account = db.prepare('SELECT id FROM accounts WHERE user_id = ? LIMIT 1').get(userId);
  }

  return { userId, accountId: account.id };
}

function insertTransactions(accountId, toInsert) {
  const stmt = db.prepare('INSERT INTO transactions (account_id, type, amount, description, status, processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
  const insertMany = db.transaction((count) => {
    for (let i = 0; i < count; i++) {
      const amount = ((i % 100) + 1) / 100.0; // small varied amounts
      const now = new Date(Date.now() - (i % 1000) * 1000).toISOString();
      stmt.run(accountId, 'deposit', amount, `Bench txn ${Date.now()}-${i}`, 'completed', now);
    }
  });
  insertMany(toInsert);
}

function methodClientSort(accountId) {
  const start = performance.now();
  const rows = db.prepare('SELECT id, account_id, type, amount, description, status, processed_at, created_at FROM transactions WHERE account_id = ?').all(accountId);
  rows.sort((a,b) => {
    const aKey = a.processed_at || a.created_at;
    const bKey = b.processed_at || b.created_at;
    const aTime = new Date(aKey).getTime();
    const bTime = new Date(bKey).getTime();
    if (bTime !== aTime) return bTime - aTime;
    const aCreated = new Date(a.created_at).getTime();
    const bCreated = new Date(b.created_at).getTime();
    if (bCreated !== aCreated) return bCreated - aCreated;
    return (b.id || 0) - (a.id || 0);
  });
  const end = performance.now();
  return { durationMs: end - start, count: rows.length };
}

function methodSqlOrder(accountId) {
  const start = performance.now();
  const rows = db.prepare(`SELECT id, account_id, type, amount, description, status, processed_at, created_at FROM transactions WHERE account_id = ? ORDER BY COALESCE(processed_at, created_at) DESC, created_at DESC, id DESC`).all(accountId);
  const end = performance.now();
  return { durationMs: end - start, count: rows.length };
}

function createIndex() {
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_account_processed_created ON transactions (account_id, processed_at, created_at)');
    return true;
  } catch (e) {
    console.warn('Failed to create index', e);
    return false;
  }
}

(async function main() {
  try {
    const { accountId } = ensureUserAndAccount();
    const currentCount = db.prepare('SELECT COUNT(1) as c FROM transactions WHERE account_id = ?').get(accountId).c;
    console.log('Account', accountId, 'current transactions:', currentCount);
    if (currentCount < TARGET_COUNT) {
      const toInsert = TARGET_COUNT - currentCount;
      console.log('Inserting', toInsert, 'transactions (this may take a while)...');
      insertTransactions(accountId, toInsert);
      console.log('Inserted transactions.');
    } else {
      console.log('No inserts needed.');
    }

    console.log('\nRunning benchmark without index...');
    const c1 = methodClientSort(accountId);
    console.log(`Client-sort: ${c1.durationMs.toFixed(2)} ms for ${c1.count} rows`);
    const s1 = methodSqlOrder(accountId);
    console.log(`SQL ORDER BY: ${s1.durationMs.toFixed(2)} ms for ${s1.count} rows`);

    console.log('\nCreating index and re-running SQL ORDER BY...');
    createIndex();
    const s2 = methodSqlOrder(accountId);
    console.log(`SQL ORDER BY with index: ${s2.durationMs.toFixed(2)} ms for ${s2.count} rows`);

    db.close();
    process.exit(0);
  } catch (e) {
    console.error('Benchmark error', e);
    process.exit(1);
  }
})();
