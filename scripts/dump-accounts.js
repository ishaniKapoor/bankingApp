const Database = require('better-sqlite3');
const db = new Database('bank.db');

try {
  const accounts = db.prepare('SELECT id, user_id, account_number, balance FROM accounts').all();
  for (const a of accounts) {
    const sum = db.prepare('SELECT SUM(ROUND(amount*100)) as cents FROM transactions WHERE account_id=? AND status=?').get(a.id, 'completed');
    const cents = sum?.cents || 0;
    const computed = cents / 100;
    const txs = db.prepare('SELECT id,type,amount,description,status,created_at,processed_at FROM transactions WHERE account_id=? ORDER BY id DESC LIMIT 10').all(a.id);
    console.log('---');
    console.log(`Account ${a.id} (${a.account_number}) storedBalance=${Number(a.balance).toFixed(2)} recomputed=${computed.toFixed(2)}`);
    console.log('Recent transactions:');
    console.table(txs);
  }
} catch (e) {
  console.error('Error dumping accounts', e);
  process.exit(1);
} finally {
  db.close();
}
