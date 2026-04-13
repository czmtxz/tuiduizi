import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const root = process.cwd();

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
};

const env = {
  ...readEnvFile(path.join(root, '.env')),
  ...readEnvFile(path.join(root, '.env.local')),
  ...process.env,
};

const connectionString = env.SUPABASE_DB_URL || env.DATABASE_URL || '';
if (!connectionString) {
  console.error('缺少 SUPABASE_DB_URL 或 DATABASE_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

const { rows } = await client.query(
  `
  SELECT p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_round_reveal_mine'
  LIMIT 1
  `
);

await client.end();

const src = rows[0]?.prosrc || '';
const ok = src.includes('rpc_round_reveal_mine') || src.length > 0;

console.log('rpc_round_reveal_mine 版本检查:', ok ? 'OK(函数已存在)' : 'MISS(函数不存在，需执行迁移 add_player_self_reveal.sql)');
if (!ok) {
  process.exitCode = 1;
}

