# LiveKit 接入说明

当前语音模块支持两种 provider：

- `Browser Stub`
- `LiveKit`

房间聊天区会显示当前使用的 provider，便于联调时快速确认当前是否真正走到 LiveKit。

当同时配置以下环境变量时，系统会自动切换到 `LiveKit`：

```bash
VITE_LIVEKIT_URL=wss://your-livekit-host
VITE_LIVEKIT_TOKEN_ENDPOINT=https://your-api.example.com/rtc/token
```

如果没有配置 `VITE_LIVEKIT_TOKEN_ENDPOINT`，但已配置 `VITE_SUPABASE_URL`，前端会默认回退到：

```bash
${VITE_SUPABASE_URL}/functions/v1/livekit-token
```

`VITE_LIVEKIT_TOKEN_ENDPOINT` 需要返回：

```json
{
  "token": "livekit-access-token"
}
```

请求体格式：

```json
{
  "roomId": "room-id",
  "participantId": "player-id"
}
```

如果 token 获取失败、配置缺失或连接失败，语音区域会直接显示对应错误文案，而不是统一提示麦克风权限错误。

仓库内还包含 `livekitConfig.test.ts` 与 `voiceProviderRegistry.test.ts`，可用于快速验证当前环境会走 Browser 还是 LiveKit。

## Supabase Edge Function 方案

仓库已内置函数骨架：

`supabase/functions/livekit-token/index.ts`

部署前需要在函数环境中配置：

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

该函数会：

- 校验当前登录用户
- 校验 `participantId` 是否属于当前房间且仍为活跃玩家
- 校验玩家是否处于有效禁言期
- 按项目内统一规则生成 `rtcRoomId`
- 返回可直接用于 `LiveKitVoiceProvider` 的 token

## 联调前自检

仓库已内置：

- 环境模板：`.env.livekit.example`
- 自检脚本：`npm run voice:doctor`

该脚本会检查：

- 前端 Supabase 配置
- LiveKit URL 是否存在
- token endpoint 是否存在或是否能回退到 Supabase Edge Function
- 本地 shell / `.env` 中是否存在函数部署相关环境变量

## 举报链路

仓库已补齐最小语音举报基础设施：

- 迁移：`add_voice_reports.sql`
- RPC：`rpc_submit_voice_report` / `rpc_review_voice_report`
- 前端入口：房间语音成员列表中的“举报”按钮

## 禁言链路

仓库已补齐最小语音禁言基础设施：

- 迁移：`add_voice_penalties.sql`
- RPC：`rpc_issue_voice_penalty` / `rpc_revoke_voice_penalty`
- 服务端阻断：
  - `rpc_upsert_voice_session`
  - `livekit-token` Edge Function
- 客户端表现：
  - 被禁言后会自动断开语音
  - 语音卡片显示禁言提示与到期时间
- 管理员入口：
  - 举报审核区的“禁言30分钟 / 解除禁言”
