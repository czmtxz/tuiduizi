import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const readEnvFile = (filePath) => {
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

const randJoinCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const root = process.cwd();
const envPath = path.join(root, '.env');
const env = readEnvFile(envPath);

const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const createRoomAndBanker = async () => {
  const joinCode = randJoinCode();
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({
      join_code: joinCode,
      status: 'waiting',
      max_bet: 1000,
      bet_step: 50,
      touzi_min_bet: 50,
      touzi_max_bet: 1000,
      cha_min_bet: 50,
      cha_max_bet: 1000,
      allow_hong: false,
      hong_min_bet: 50,
      hong_max_bet: 1000,
    })
    .select()
    .single();
  if (roomError || !room) throw roomError || new Error('Failed to create room');

  const { data: banker, error: bankerError } = await supabase
    .from('players')
    .insert({ room_id: room.id, name: '1号', role: 'banker', position: 'banker', is_ready: true })
    .select()
    .single();
  if (bankerError || !banker) throw bankerError || new Error('Failed to create banker');

  await supabase.from('rooms').update({ banker_id: banker.id }).eq('id', room.id);
  return { room, banker };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const simulateJoinLikeClient = async (roomId, name) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: players, error } = await supabase.from('players').select('*').eq('room_id', roomId);
    if (error) throw error;
    const taken = new Set((players || []).map((p) => p.position).filter(Boolean));
    const order = ['chumen', 'zhongmen', 'momen'];
    const nextPos = order.find((p) => !taken.has(p));
    if (!nextPos) {
      return { ok: false, reason: 'full' };
    }

    const { data: inserted, error: insertError } = await supabase
      .from('players')
      .insert({ room_id: roomId, name, role: 'player', position: nextPos, is_ready: true })
      .select()
      .single();

    if (!insertError && inserted) {
      return { ok: true, player: inserted };
    }

    if (insertError && insertError.code === '23505') {
      await sleep(60 + Math.floor(Math.random() * 120));
      continue;
    }

    return { ok: false, reason: 'insert_error', message: insertError?.message };
  }

  return { ok: false, reason: 'retry_exceeded' };
};

const summarizeRoom = async (roomId) => {
  const { data: players, error } = await supabase.from('players').select('id, name, role, position, joined_at').eq('room_id', roomId);
  if (error) throw error;
  const counts = {};
  for (const p of players || []) {
    const k = p.position || 'null';
    counts[k] = (counts[k] || 0) + 1;
  }
  return { players: players || [], counts };
};

const main = async () => {
  const { room } = await createRoomAndBanker();
  console.log(`[OK] Room created join_code=${room.join_code}`);

  const concurrent = 10;
  const joins = await Promise.allSettled(
    Array.from({ length: concurrent }, (_, i) => simulateJoinLikeClient(room.id, `test${i + 1}`))
  );

  const ok = joins.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
  const failed = joins.length - ok;
  console.log(`[OK] Concurrent joins attempted=${concurrent}, succeeded=${ok}, failed=${failed}`);

  const bankerAttempts = await Promise.allSettled([
    supabase.from('players').insert({ room_id: room.id, name: 'bankerX', role: 'banker', position: 'banker' }).select().single(),
    supabase.from('players').insert({ room_id: room.id, name: 'bankerY', role: 'banker', position: 'banker' }).select().single(),
  ]);
  const bankerFailures = bankerAttempts.filter((r) => r.status === 'fulfilled' && r.value.error).length;
  console.log(`[OK] Banker duplicate attempts failed=${bankerFailures}/2 (expected 2/2)`);

  const summary = await summarizeRoom(room.id);
  console.log('[OK] Position counts:', summary.counts);
  const ordered = summary.players.slice().sort((a, b) => String(a.position).localeCompare(String(b.position)));
  for (const p of ordered) {
    console.log(` - ${p.position} | ${p.role} | ${p.name}`);
  }

  const bad = Object.entries(summary.counts).filter(([k, v]) => (k === 'banker' ? v !== 1 : ['chumen', 'zhongmen', 'momen'].includes(k) ? v > 1 : false));
  if (bad.length > 0) {
    console.log('[FAIL] Duplicate positions detected:', bad);
    process.exitCode = 1;
  } else {
    console.log('[PASS] No duplicate positions in room');
  }
};

main().catch((e) => {
  console.error('[FAIL]', e);
  process.exitCode = 1;
});
