## Agora Token 服务

本目录提供一套可单独部署的 Agora RTC token 服务：
- 校验 Supabase 登录态
- 校验玩家属于对应房间且未被禁言
- 返回 Agora Web SDK 进频道所需 `appId/channel/uid/token`

## 生产接入建议

推荐把 Agora 作为生产默认语音方案，并在管理员后台把“语音平台”设置成：
- `agora`
或
- `auto`（当环境中配置了 Agora 时，会优先使用 Agora）

前端生产环境至少需要：
- `VITE_AGORA_APP_ID`
- `VITE_AGORA_TOKEN_ENDPOINT`

如果你走 Supabase Edge Function，则 `VITE_AGORA_TOKEN_ENDPOINT` 可不填，前端会默认回退到：
- `${VITE_SUPABASE_URL}/functions/v1/agora-token`

### 本地启动

```bash
cd deploy/agora-token/token-service
npm install
AGORA_APP_ID=xxx AGORA_APP_CERTIFICATE=xxx SUPABASE_URL=xxx SUPABASE_ANON_KEY=xxx node server.mjs
```

接口：
- `POST /agora/token`

### Docker 启动

```bash
cd deploy/agora-token
docker compose up -d --build
```

生产部署后，接口地址通常为：
- `http(s)://你的域名或IP:8789/agora/token`

### Supabase Edge Function 方案

如果你不想单独部署 Docker token 服务，也可以直接使用仓库中的：
- `supabase/functions/agora-token/index.ts`

需要在 Supabase Functions 环境里配置：
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `AGORA_TOKEN_EXPIRE_SECONDS`（可选，默认 3600）

### 前端最终配置示例

```env
VITE_AGORA_APP_ID=df6463ab93874b9ba06782f93909c8c3
VITE_AGORA_TOKEN_ENDPOINT=https://voice.example.com/agora/token
```

### 验证通过标准

- 页面语音面板显示 `Provider: Agora`
- 两个玩家都能成功“开启实时语音”
- 调试日志出现：
  - `已拿到 RTC Token`
  - `加入频道成功`
  - `本地麦克风已发布`
  - `已订阅并播放远端音频`
