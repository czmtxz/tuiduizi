## LiveKit 生产部署

本目录提供一套完整的 LiveKit 自建方案：
- `livekit-server`
- `redis`
- `voice-token`（校验 Supabase 登录态并签发 LiveKit token）
- `caddy`（可选，统一处理 HTTPS 与域名转发）

### 需要准备

- 一个可用域名给 LiveKit：
  - `LIVEKIT_DOMAIN`
- 一个可用域名给 token 服务：
  - `TOKEN_DOMAIN`
- Supabase 项目：
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- LiveKit 密钥：
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`

### 启动

```bash
cd deploy/livekit
cp .env.example .env
docker compose up -d --build
```

### 本地 Docker 联调

如果你只是想在本机快速把 LiveKit 跑起来联调，不想先准备域名和 HTTPS，可以直接使用：

```bash
cd deploy/livekit
LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret SUPABASE_URL=你的supabase-url SUPABASE_ANON_KEY=你的supabase-anon-key docker compose -f docker-compose.local.yml up -d --build
```

本地联调时前端建议配置：

```env
VITE_LIVEKIT_URL=ws://localhost:7880
VITE_LIVEKIT_TOKEN_ENDPOINT=http://localhost:8787/rtc/token
```

说明：
- `docker-compose.local.yml` 使用 `livekit-server --dev`
- 默认 key/secret 可直接使用：
  - `devkey`
  - `secret`
- 只适合本机联调，不适合生产

### 前端生产环境

```env
VITE_LIVEKIT_URL=wss://voice.example.com
VITE_LIVEKIT_TOKEN_ENDPOINT=https://token.example.com/rtc/token
```

### 后台推荐设置

管理员后台“语音平台”建议设置为：
- `livekit`
或
- `auto`（当 Agora 不启用时回退到 LiveKit）

### 验证通过标准

- 页面语音卡片显示 `Provider: LiveKit`
- 两端都能成功开启实时语音
- 调试日志出现：
  - `已拿到 LiveKit token`
  - `LiveKit 房间连接成功`
  - `已订阅并播放 LiveKit 远端音频`
