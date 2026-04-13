import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

const results = [];
const push = (name, ok, detail) => results.push({ name, ok, detail });

const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';
const gmeSdkAppId = env.VITE_TENCENT_GME_SDK_APPID || '';
const gmeSdkUrl = env.VITE_TENCENT_GME_SDK_URL || '';
const gmeTokenEndpoint =
  env.VITE_TENCENT_GME_TOKEN_ENDPOINT ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1/gme-token` : '');
const livekitUrl = env.VITE_LIVEKIT_URL || '';
const livekitTokenEndpoint =
  env.VITE_LIVEKIT_TOKEN_ENDPOINT ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1/livekit-token` : '');

push('VITE_SUPABASE_URL', Boolean(supabaseUrl), supabaseUrl || '缺失');
push('VITE_SUPABASE_ANON_KEY', Boolean(supabaseAnonKey), supabaseAnonKey ? '已配置' : '缺失');
push('VITE_TENCENT_GME_SDK_APPID', Boolean(gmeSdkAppId), gmeSdkAppId || '未配置');
push('VITE_TENCENT_GME_SDK_URL', Boolean(gmeSdkUrl), gmeSdkUrl || '未配置');
push(
  'VITE_TENCENT_GME_TOKEN_ENDPOINT',
  Boolean(gmeSdkAppId && gmeSdkUrl ? gmeTokenEndpoint : true),
  gmeSdkAppId && gmeSdkUrl ? gmeTokenEndpoint || '缺失' : '未启用 GME，无需配置'
);
push('VITE_LIVEKIT_URL', Boolean(livekitUrl), livekitUrl || '未配置，将仅使用 Browser Stub');
push(
  'VITE_LIVEKIT_TOKEN_ENDPOINT',
  Boolean(livekitUrl ? livekitTokenEndpoint : true),
  livekitUrl ? livekitTokenEndpoint || '缺失' : '未启用 LiveKit，无需配置'
);

const edgeNeeded = Boolean(livekitUrl && !env.VITE_LIVEKIT_TOKEN_ENDPOINT);
push(
  'SUPABASE Edge Function fallback',
  edgeNeeded ? Boolean(supabaseUrl) : true,
  edgeNeeded
    ? `默认回退到 ${livekitTokenEndpoint || '缺失'}`
    : '未使用默认回退'
);

const gmeEdgeNeeded = Boolean(gmeSdkAppId && gmeSdkUrl && !env.VITE_TENCENT_GME_TOKEN_ENDPOINT);
push(
  'GME Edge Function fallback',
  gmeEdgeNeeded ? Boolean(supabaseUrl) : true,
  gmeEdgeNeeded
    ? `默认回退到 ${gmeTokenEndpoint || '缺失'}`
    : '未使用默认回退'
);

const serverEnvKeys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'TENCENT_GME_SDK_APPID', 'TENCENT_GME_SECRET_KEY'];
for (const key of serverEnvKeys) {
  push(`函数环境 ${key}`, env[key] ? true : false, env[key] ? '已配置' : '未在本地 shell/.env 中发现');
}

console.log('LiveKit / Voice Doctor');
console.log('='.repeat(32));
for (const row of results) {
  console.log(`${row.ok ? '[OK]' : '[MISS]'} ${row.name}: ${row.detail}`);
}

const hardFail = results.some(row => !row.ok && (row.name === 'VITE_SUPABASE_URL' || row.name === 'VITE_SUPABASE_ANON_KEY'));
const livekitFail = Boolean(livekitUrl) && results.some(row => !row.ok && (
  row.name === 'VITE_LIVEKIT_TOKEN_ENDPOINT' || row.name === 'SUPABASE Edge Function fallback'
));

if (hardFail || livekitFail) {
  console.log('\n结论: 当前配置不足以完成目标链路。');
  process.exitCode = 1;
} else {
  console.log('\n结论: 当前配置已满足本地前端联调要求。');
}
