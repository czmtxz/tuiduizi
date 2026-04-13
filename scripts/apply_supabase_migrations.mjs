import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
};

const env = {
  ...readEnvFile(path.join(root, '.env')),
  ...readEnvFile(path.join(root, '.env.local')),
  ...process.env,
};

const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const fileArgIndex = args.findIndex((x) => x === '--file');
const singleFile = fileArgIndex >= 0 ? args[fileArgIndex + 1] : null;

if (showHelp) {
  console.log(`
用法:
  npm run migrate:apply
  npm run migrate:apply -- --file add_reveal_flow_phase_and_hands.sql

环境变量:
  SUPABASE_DB_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

说明:
  - 脚本会自动创建 public.app_migration_history
  - 已执行过的 SQL 会自动跳过
  - 可用 --file 指定只执行某一个迁移文件
`);
  process.exit(0);
}

const connectionString = env.SUPABASE_DB_URL || env.DATABASE_URL || '';

const migrationOrderWeight = new Map([
  ['init_schema.sql', 0],
  ['add_admin_emails.sql', 10],
  ['add_chat_and_player_active.sql', 20],
  ['add_room_ai_enabled.sql', 30],
  ['add_room_bet_rules.sql', 40],
  ['add_hong_bet_rules.sql', 50],
  ['add_room_invites.sql', 60],
  ['add_reveal_flow_phase_and_hands.sql', 70],
  ['add_bet_sync_audio_events.sql', 80],
  ['add_voice_chat_sessions.sql', 90],
  ['add_voice_reports.sql', 100],
  ['add_voice_penalties.sql', 110],
  ['fix_rpc_round_deal_start_banker_lookup.sql', 111],
  ['fix_rpc_round_deal_start_player_order.sql', 112],
  ['fix_rpc_round_deal_finish_phase_ambiguity.sql', 113],
  ['fix_players_select_policy.sql', 114],
  ['add_player_self_reveal.sql', 115],
  ['grant_rpc_round_reveal_mine_to_anon.sql', 116],
  ['fix_rpc_round_reveal_mine_rounds_updated_at.sql', 117],
  ['add_bet_seal_and_close.sql', 118],
  ['add_app_settings_allow_guest.sql', 119],
  ['add_game_records_user_id_and_admin.sql', 120],
  ['add_public_voice_events.sql', 125],
  ['add_app_settings_voice_provider.sql', 126],
  ['cleanup_inactive_rooms.sql', 130],
  ['enforce_single_banker_and_positions.sql', 140],
  ['enforce_unique_rooms_join_code.sql', 145],
  ['rls_allow_update_delete.sql', 150],
]);

if (!connectionString) {
  console.error('缺少 SUPABASE_DB_URL 或 DATABASE_URL，无法执行远端迁移。');
  process.exit(1);
}

if (!fs.existsSync(migrationsDir)) {
  console.error(`迁移目录不存在: ${migrationsDir}`);
  process.exit(1);
}

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => {
    const aw = migrationOrderWeight.get(a) ?? 1000;
    const bw = migrationOrderWeight.get(b) ?? 1000;
    if (aw !== bw) return aw - bw;
    return a.localeCompare(b);
  });

const targetFiles = singleFile
  ? migrationFiles.filter((name) => name === singleFile)
  : migrationFiles;

if (singleFile && targetFiles.length === 0) {
  console.error(`未找到迁移文件: ${singleFile}`);
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: connectionString.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined,
});

const ensureHistoryTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.app_migration_history (
      id BIGSERIAL PRIMARY KEY,
      file_name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const sha1 = async (content) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha1').update(content).digest('hex');
};

const shouldSkipBootstrapMigration = async (fileName) => {
  if (fileName !== 'init_schema.sql') return false;
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.rooms') IS NOT NULL AS has_rooms,
      to_regclass('public.players') IS NOT NULL AS has_players,
      to_regclass('public.rounds') IS NOT NULL AS has_rounds,
      to_regclass('public.bets') IS NOT NULL AS has_bets
  `);
  const row = rows[0];
  return Boolean(row?.has_rooms || row?.has_players || row?.has_rounds || row?.has_bets);
};

const main = async () => {
  await client.connect();
  await ensureHistoryTable();

  const { rows } = await client.query('SELECT file_name, checksum FROM public.app_migration_history');
  const applied = new Map(rows.map((r) => [r.file_name, r.checksum]));

  let executed = 0;

  for (const fileName of targetFiles) {
    const fullPath = path.join(migrationsDir, fileName);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const checksum = await sha1(sql);
    const existing = applied.get(fileName);

    if (existing === checksum) {
      console.log(`[skip] ${fileName}`);
      continue;
    }

    if (await shouldSkipBootstrapMigration(fileName)) {
      console.log(`[skip-bootstrap] ${fileName}`);
      await client.query(
        `
        INSERT INTO public.app_migration_history (file_name, checksum)
        VALUES ($1, $2)
        ON CONFLICT (file_name)
        DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW()
        `,
        [fileName, checksum]
      );
      applied.set(fileName, checksum);
      continue;
    }

    console.log(`[apply] ${fileName}`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `
        INSERT INTO public.app_migration_history (file_name, checksum)
        VALUES ($1, $2)
        ON CONFLICT (file_name)
        DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW()
        `,
        [fileName, checksum]
      );
      await client.query('COMMIT');
      executed += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[fail] ${fileName}`);
      throw error;
    }
  }

  console.log(`[done] 本次执行迁移 ${executed} 个`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => void 0);
  });
