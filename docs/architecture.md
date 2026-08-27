# 架构设计

OuyiAgent (欧亿 AI 适配器) 是一个专为 **欧亿Ai-7.0** 打造的 OpenAI 兼容网关转换器。

## 链路设计

```
[客户端 / New API]
       │
       │ HTTP POST /v1/chat/completions (OpenAI 标准协议)
       ▼
[OuyiAgent (端口 8081)]
  ├─ 1. Bearer API Key 鉴权与并发控制 (Semaphore)
  ├─ 2. OpenAI 请求解析与模型映射
  ├─ 3. 向上游发起会话创建 (POST /chatapi/chat/save)
  ├─ 4. 向上游发送消息 (POST /chatapi/chat/message)
  ├─ 5. 实时拉取文本流并转为 OpenAI SSE 帧 (POST /chatapi/chat/message/{id})
  └─ 6. 在 finally 中清理销毁临时会话 (POST /chatapi/chat/delete)
       │
       ▼
[欧亿 AI 官方上游 (api-8.rcouyi.com)]
```

## 核心特性
- **无状态与会话隔离**：每次 API 请求独立创建并销毁会话，互不干扰，不留后台冗余记录。
- **全流式实时响应**：支持 SSE 打字机流式输出与标准非流式聚合输出。
- **动态模型发现**：自动读取用户 VIP 权限下的 60+ 款模型并格式化为 OpenAI `/v1/models` 列表。
