const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'bank.db');
const db = new Database(dbPath);

function ensureUserAndAccount() {
  let user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) {
    db.prepare(`INSERT INTO users (email, password, first_name, last_name, phone_number, date_of_birth, ssn, address, city, state, zip_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('sim@example.com', 'x', 'Sim', 'User', '+10000000000', '1990-01-01', '000000000', '1 Test St', 'Testville', 'NY', '12345');
    user = db.prepare('SELECT id FROM users WHERE email = ?').get('sim@example.com');
  }
  const userId = user.id;

  let account = db.prepare('SELECT id, balance FROM accounts WHERE user_id = ? LIMIT 1').get(userId);
  if (!account) {
    db.prepare('INSERT INTO accounts (user_id, account_number, account_type, balance, status) VALUES (?, ?, ?, ?, ?)')
      .run(userId, '0000000001', 'checking', 0, 'active');
    account = db.prepare('SELECT id, balance FROM accounts WHERE user_id = ? LIMIT 1').get(userId);
  }

  return { userId, accountId: account.id, balance: account.balance };
}

(function main() {
  try {
    const { userId, accountId, balance } = ensureUserAndAccount();
    console.log('Using account', accountId, 'user', userId, 'starting balance', balance);

    const insertedIds = [];
    for (let i = 1; i <= 3; i++) {
      const amount = Math.round((1.23 * i) * 100) / 100;
      const now = new Date().toISOString();
      const info = db.prepare('INSERT INTO transactions (account_id, type, amount, description, status, processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
        .run(accountId, 'deposit', amount, `Simulated funding ${i}`, 'completed', now);
      insertedIds.push(info.lastInsertRowid);
      // update balance
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(amount, accountId);
      console.log('Inserted transaction id', info.lastInsertRowid, 'amount', amount);
    }

    // Fetch transactions and apply server-side sorting logic
    const rows = db.prepare('SELECT id, account_id, type, amount, description, status, processed_at, created_at FROM transactions WHERE account_id = ?').all(accountId);
    // sort: processedAt desc, createdAt desc, id desc
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

    console.log('\nFetched transactions after simulation (most recent first):');
    rows.slice(0, 20).forEach(r => console.log(r.id, r.amount, r.processed_at || r.created_at, r.description));

    const finalAccount = db.prepare('SELECT id, balance FROM accounts WHERE id = ?').get(accountId);
    console.log('\nFinal account balance:', finalAccount.balance);

    db.close();
    process.exit(0);
  } catch (e) {
    console.error('Simulation error', e);
    process.exit(1);
  }
})();
