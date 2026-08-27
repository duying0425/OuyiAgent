# OuyiAgent

一个专为 **欧亿Ai-7.0** 打造的高性能 OpenAI 兼容协议适配器。它将标准 `POST /v1/chat/completions` 请求转换为欧亿 AI 会话协议与实时数据流，可作为 New API、One API 或直接客户端调用的标准上游渠道。

## 🌟 特性

- ⚡ **原生纯净**：基于 Node.js 20+ 内置 fetch 与原生 test 运行，零多余依赖，极轻量。
- 🔄 **OpenAI 标准兼容**：支持 `/v1/models`、`/v1/chat/completions`（流式 SSE 与非流式 JSON）。
- 🛡️ **隔离与清理**：每次请求自动创建独立会话并在 `finally` 中彻底销毁，保证安全与数据隔离。
- 🎯 **动态模型目录**：自动探测用户 VIP 权限下的 60+ 种高级模型（Claude 3.7 Sonnet、GPT-4.1、DeepSeek R1/V3.2、Gemini 2.5/3.1 等）。
- 🚦 **并发与过载保护**：内置信号量并发控制器与请求超时控制。
- 🐳 **开箱即用**：自带 Dockerfile、Docker Compose 与丰富探测排障脚本。

## 🚀 快速启动

```bash
git clone https://github.com/duying0425/OuyiAgent.git
cd OuyiAgent

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 配置密钥和欧亿 Token
# OUYI_TOKEN=你的欧亿JWT令牌
# ADAPTER_API_KEY=随机长密钥

npm install
npm run dev
```

## 🧪 验证与测试

```bash
# 运行单元测试
npm test

# 语法与规范检查
npm run check

# 探测上游模型目录
npm run probe

# 执行一次真实端到端生成测试
npm run probe:env -- --allow-completion
```

## 🐳 Docker 部署与 New API 接入

```bash
docker compose up -d --build
```

在 New API / One API 后台新增渠道：
* **类型**：`OpenAI`
* **Base URL**：`http://ouyi-adapter:8081`
* **Key**：`.env` 中配置的 `ADAPTER_API_KEY`
* **模型**：点击「获取模型」自动拉取

## 📄 开源许可

UNLICENSED (个人自用)
