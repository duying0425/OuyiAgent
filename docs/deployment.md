# 部署指南

## 1. 独立运行

```bash
cp .env.example .env
# 编辑 .env，填入 ADAPTER_API_KEY 和 OUYI_TOKEN
npm run dev
```

## 2. Docker Compose 运行

```bash
docker compose up -d --build
```

## 3. 接入 New API

在 New API 管理后台 $\rightarrow$ **渠道** $\rightarrow$ **新增渠道**：
* **类型**：`OpenAI`
* **名称**：`欧亿 AI 渠道`
* **Base URL**：`http://ouyi-adapter:8081`
* **Key**：与 `.env` 中的 `ADAPTER_API_KEY` 保持一致
* **模型**：点击「获取模型」自动拉取，或手动添加 `claude-3-7-sonnet-20250219-vip` 等。
