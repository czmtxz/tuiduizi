import { supabase } from './supabase';
import { toSupabaseError } from './supabaseError';

let cachedAt = 0;
let cachedOk = false;
const CACHE_MS = 10_000;

const runSchemaChecks = async () => {
  const checks = [
    () => supabase.from('rounds').select('id,phase,all_revealed,dealer_player_id').limit(1),
    () => supabase.from('round_hands').select('id,round_id,position,is_revealed').limit(1),
  ];

  for (const check of checks) {
    const result = await check();
    if (result.error) throw toSupabaseError(result.error, '数据库结构检查失败');
  }
};

export const ensureCoreGameSchemaReady = async () => {
  const now = Date.now();
  if (cachedOk && now - cachedAt < CACHE_MS) return;
  await runSchemaChecks();
  cachedAt = now;
  cachedOk = true;
};

