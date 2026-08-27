# API 使用手册

## 1. 获取模型列表

```bash
curl http://127.0.0.1:8081/v1/models \
  -H "Authorization: Bearer <ADAPTER_API_KEY>"
```

## 2. 文本对话 (流式)

```bash
curl http://127.0.0.1:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADAPTER_API_KEY>" \
  -d '{
    "model": "claude-3-7-sonnet-20250219-vip",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```
