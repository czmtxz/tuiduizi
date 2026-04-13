import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

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

const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const checks = [
  ['rounds.phase', () => supabase.from('rounds').select('id,phase,all_revealed,dealer_player_id').limit(1)],
  ['round_hands', () => supabase.from('round_hands').select('id,round_id,position,is_revealed').limit(1)],
  ['audio_event_logs', () => supabase.from('audio_event_logs').select('id,room_id,event_type').limit(1)],
  ['rtc_sessions', () => supabase.from('rtc_sessions').select('id,room_id,status').limit(1)],
  ['voice_reports', () => supabase.from('voice_reports').select('id,room_id,status').limit(1)],
  ['voice_penalties', () => supabase.from('voice_penalties').select('id,room_id,action_type').limit(1)],
];

let hasFailure = false;

console.log('Supabase Schema Doctor');
console.log('='.repeat(32));

for (const [name, run] of checks) {
  const result = await run();
  if (result.error) {
    hasFailure = true;
    console.log(`[MISS] ${name}: ${result.error.message}`);
  } else {
    console.log(`[OK]   ${name}`);
  }
}

if (hasFailure) {
  console.log('\n结论: 当前数据库 schema 落后于前端代码，请先运行 npm run migrate:apply');
  process.exitCode = 1;
} else {
  console.log('\n结论: 当前数据库 schema 已满足前端代码要求。');
}

