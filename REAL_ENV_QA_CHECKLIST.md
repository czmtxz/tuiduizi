# 真实环境联调检查清单

## 1. 数据库迁移

- 执行全部迁移：
  - `npm run migrate:apply`
- 确认以下迁移已落库：
  - `add_reveal_flow_phase_and_hands.sql`
  - `add_bet_sync_audio_events.sql`
  - `add_voice_chat_sessions.sql`
  - `add_voice_reports.sql`
  - `add_voice_penalties.sql`

## 2. Edge Function

- 部署 `supabase/functions/livekit-token/index.ts`
- 配置函数环境变量：
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`

## 3. 前端环境

- 配置：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_LIVEKIT_URL`
- 可选：
  - `VITE_LIVEKIT_TOKEN_ENDPOINT`
- 运行：
  - `npm run voice:doctor`
  - `npm run dev`

## 4. 发牌/开牌流程

- 4 人入座后正常开始游戏
- 闲家在 `betting` 可下注
- 掷骰后进入 `dice_done`，下注面板封盘
- 庄家点击发牌后进入 `dealing`
- 发牌完成后进入 `wait_reveal`
- 庄家可逐家开牌
- 庄家可批量开三家
- 四家全亮后自动结算
- 刷新页面后状态可恢复

## 5. 下注同步音效

- 至少两端同时在线
- 一端下注后，其他端同步播放下注音效
- 关闭“下注同步音效”后，本端不播放
- 不同下注类型能听出差异

## 6. 实时语音

- `Provider` 显示符合当前环境
- 首次开启语音会申请麦克风权限
- 拒绝权限时显示明确错误
- 开启后成员列表出现在线状态
- 静音后状态变化同步
- LiveKit 配置完整时可成功接房
- 被管理员禁言后，无法开启语音或获取 LiveKit token
- 被管理员禁言时，如当前正在语音中，应自动断开并显示禁言到期时间
- 解除禁言后，可以重新接入语音

## 7. 举报/审核

- 房间语音成员列表可以提交举报
- `voice_reports` 中成功写入数据
- 管理员面板能看到该房间举报
- 管理员可执行：
  - 标记已阅
  - 已解决
  - 驳回
- 管理员可执行：
  - 禁言30分钟
  - 解除禁言
- 审核备注与状态更新成功
