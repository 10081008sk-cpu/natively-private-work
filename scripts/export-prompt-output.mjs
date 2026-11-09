// One-off export: dump every saved prompt/output from natively.db
// (table ai_interactions) to prompt-output-history-export.txt + last-prompt-output-export.txt
// in the repo root. Read-only; safe to run anytime.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'Natively', 'natively.db')
  : path.join(process.env.HOME || '', '.config', 'Natively', 'natively.db');

if (!fs.existsSync(dbPath)) {
  console.error('DB not found at', dbPath);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const rows = db.prepare(
  'SELECT meeting_id, type, timestamp, user_query, ai_response, metadata_json FROM ai_interactions ORDER BY timestamp ASC'
).all();
db.close();

console.log(`Exporting ${rows.length} prompt/output rows from ${dbPath}`);

function fmt(r) {
  const ts = r.timestamp ? new Date(r.timestamp).toISOString() : '(no timestamp)';
  const prompt = r.user_query ? String(r.user_query) : '(no prompt text)';
  let out = r.ai_response ? String(r.ai_response) : '';
  if (!out && r.metadata_json) out = String(r.metadata_json);
  if (!out) out = '(no output text)';
  return [
    `Type: ${r.type || 'unknown'}`,
    `Timestamp: ${ts}`,
    `Meeting: ${r.meeting_id || ''}`,
    '',
    'Prompt:',
    prompt,
    '',
    'Output:',
    out,
    '',
  ].join('\n');
}

const history = rows.map(fmt).join(`\n${'='.repeat(60)}\n`);
const historyPath = path.join(root, 'prompt-output-history-export.txt');
fs.writeFileSync(historyPath, history ? history + '\n' : '(no rows in ai_interactions)\n', 'utf-8');
console.log('wrote', historyPath);

if (rows.length > 0) {
  const lastPath = path.join(root, 'last-prompt-output-export.txt');
  fs.writeFileSync(lastPath, fmt(rows[rows.length - 1]), 'utf-8');
  console.log('wrote', lastPath);
}
