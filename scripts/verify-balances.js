const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'bank.db');
const db = new Database(dbPath);

function recomputeBalance(accountId) {
  const rows = db.prepare('SELECT amount FROM transactions WHERE account_id = ? AND status = ?').all(accountId, 'completed');
  let cents = 0;
  for (const r of rows) {
    cents += Math.round(Number(r.amount) * 100);
  }
  return cents / 100;
}

(function main() {
  try {
    console.log('Verifying balances for all accounts...');
    const accounts = db.prepare('SELECT id, user_id, balance FROM accounts').all();
    let mismatches = 0;
    for (const a of accounts) {
      const computed = recomputeBalance(a.id);
      const stored = Number(a.balance);
      const diff = Math.round((stored - computed) * 100) / 100;
      if (Math.abs(diff) > 0.001) {
        mismatches++;
        console.log(`Account ${a.id} mismatch: stored=${stored.toFixed(2)} recomputed=${computed.toFixed(2)} diff=${diff.toFixed(2)}`);
      }
    }

    if (mismatches === 0) {
      console.log('All account balances match recomputed totals.');
    } else {
      console.log(`${mismatches} account(s) with mismatched balances.`);
    }

    db.close();
    process.exit(mismatches === 0 ? 0 : 2);
  } catch (e) {
    console.error('Verification error', e);
    process.exit(1);
  }
})();
