# Supabase 迁移执行说明

## 1. 准备数据库连接串

设置环境变量 `SUPABASE_DB_URL`，格式如下：

```bash
postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

说明：
- `<project-ref>` 可从 `VITE_SUPABASE_URL` 中取出
- `<password>` 为 Supabase 项目的数据库密码

## 2. 执行全部迁移

```bash
npm run migrate:apply
```

## 3. 只执行 reveal flow 迁移

```bash
npm run migrate:apply -- --file add_reveal_flow_phase_and_hands.sql
```

## 4. 幂等说明

- 脚本会自动创建 `public.app_migration_history`
- 已执行且内容未变化的 SQL 会自动跳过
- 修改过的同名 SQL 会重新执行并刷新 checksum

