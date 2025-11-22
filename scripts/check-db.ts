import '../lib/db';
import { closeAllDbConnections } from '../lib/db';
import Database from 'better-sqlite3';

function getCount(conn: Database, table: string) {
  try {
    const row = conn.prepare(`SELECT count(*) as c FROM ${table}`).get();
    return typeof row?.c === 'number' ? row.c : Number(row?.c || 0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`Could not query table ${table}:`, e?.message || e);
    return -1;
  }
}

function main() {
  // This script imports `lib/db` (side-effect: initializes DB). It then opens a read-only
  // direct connection to the same SQLite file to report table row counts. Run with `npx ts-node scripts/check-db.ts`.

  // eslint-disable-next-line no-console
  console.log('Loaded lib/db (init should have run).');

  const dbFile = 'bank.db';
  let conn: Database | null = null;
  try {
    conn = new Database(dbFile, { readonly: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to open bank.db directly:', err?.message || err);
    process.exit(1);
  }

  const tables = ['users', 'accounts', 'transactions', 'sessions'];
  for (const t of tables) {
    const c = getCount(conn, t);
    // eslint-disable-next-line no-console
    console.log(`${t}: ${c}`);
  }

  conn.close();

  // Verify the helper to close connections exists
  // eslint-disable-next-line no-console
  console.log('closeAllDbConnections exported:', typeof closeAllDbConnections === 'function');
}

main();
