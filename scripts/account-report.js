const Database = require('better-sqlite3');
const db = new Database('bank.db');

function report(last4) {
  const acc = db.prepare('SELECT id, account_number, balance FROM accounts WHERE account_number LIKE ?').get('%' + last4);
  if (!acc) {
    console.log('Account not found for last4=', last4);
    return;
  }
  const txs = db.prepare('SELECT id,type,amount,description,status,created_at,processed_at FROM transactions WHERE account_id=? ORDER BY created_at ASC, id ASC').all(acc.id);
  const sumAll = db.prepare("SELECT SUM(ROUND(amount*100)) as cents FROM transactions WHERE account_id=? AND status='completed'").get(acc.id);
  const sumDeposits = db.prepare("SELECT SUM(ROUND(amount*100)) as cents FROM transactions WHERE account_id=? AND status='completed' AND type='deposit'").get(acc.id);
  const sumWithdrawals = db.prepare("SELECT SUM(ROUND(amount*100)) as cents FROM transactions WHERE account_id=? AND status='completed' AND type='withdrawal'").get(acc.id);

  console.log('Account:', acc);
  console.log('Computed totals (cents):', sumAll?.cents || 0, sumDeposits?.cents || 0, sumWithdrawals?.cents || 0);
  console.log('Computed totals (dollars):', ((sumAll?.cents || 0)/100).toFixed(2), ((sumDeposits?.cents || 0)/100).toFixed(2), ((sumWithdrawals?.cents || 0)/100).toFixed(2));
  console.log('Transactions:');
  console.table(txs);
}

const last4 = process.argv[2] || '4264';
report(last4);

db.close();
