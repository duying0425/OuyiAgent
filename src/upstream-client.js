import { UpstreamError } from './errors.js';

function createLinkedTimeoutSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) onAbort();
  else parentSignal?.addEventListener('abort', onAbort, { once: true });

  const timer = setTimeout(() => controller.abort(new Error('upstream timeout')), timeoutMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onAbort);
    },
  };
}

export class UpstreamClient {
  constructor(config, { fetchImpl = globalThis.fetch, clock = () => Date.now(), logger } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.clock = clock;
    this.logger = logger;
    this.accountStatus = {
      state: 'unknown',
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorKind: null,
    };
  }

  getStatus() {
    return { ...this.accountStatus };
  }

  markHealthy() {
    this.accountStatus = {
      state: 'healthy',
      lastSuccessAt: this.clock(),
      lastErrorAt: this.accountStatus.lastErrorAt,
      lastErrorKind: null,
    };
  }

  markFailure(kind) {
    const state = ['auth_expired', 'rate_limited'].includes(kind) ? kind : 'degraded';
    this.accountStatus = {
      ...this.accountStatus,
      state,
      lastErrorAt: this.clock(),
      lastErrorKind: kind,
    };
  }

  headers({ json = true } = {}) {
    const token = this.config.upstreamToken.startsWith('Bearer ')
      ? this.config.upstreamToken
      : `Bearer ${this.config.upstreamToken}`;

    const headers = {
      Authorization: token,
      'Accept-Language': 'zh-CN',
      origin: 'https://ai.rcouyi.com',
      referer: 'https://ai.rcouyi.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  url(path) {
    return `${this.config.upstreamBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async fetchModelCatalog({ signal } = {}) {
    const linked = createLinkedTimeoutSignal(signal, 30_000);
    try {
      const res = await this.fetch(this.url('/chatapi/auth/memberInfo'), {
        headers: this.headers({ json: false }),
        signal: linked.signal,
      });
      if (!res.ok) throw new Error(`memberInfo returned HTTP ${res.status}`);
      const data = await res.json();
      const privileges = data.result?.groupInfo?.privileges ?? [];
      const models = [];
      for (const p of privileges) {
        if (Array.isArray(p.customAIModels)) {
          models.push(...p.customAIModels);
        }
      }
      this.markHealthy();
      return [...new Set(models)];
    } catch (error) {
      this.markFailure('upstream_unavailable');
      throw error;
    } finally {
      linked.dispose();
    }
  }

  async createTopic({ model, systemMessage = '', maxTokens = 4096, temperature = 0.7, signal }) {
    const linked = createLinkedTimeoutSignal(signal, this.config.upstreamTimeoutMs);
    try {
      const body = {
        id: 0,
        roleId: 0,
        title: 'API Session',
        isLock: false,
        systemMessage: systemMessage || '',
        params: JSON.stringify({
          chatPluginIds: [],
          frequency_penalty: null,
          max_tokens: maxTokens,
          model,
          presence_penalty: null,
          requestMsgCount: 8,
          speechVoice: 'Alloy',
          temperature,
        }),
      };

      const res = await this.fetch(this.url('/chatapi/chat/save'), {
        method: 'POST',
        headers: this.headers({ json: true }),
        body: JSON.stringify(body),
        signal: linked.signal,
      });

      if (!res.ok) {
        throw new UpstreamError(`Create topic failed with HTTP ${res.status}`, {
          status: res.status,
          kind: res.status === 401 ? 'auth_expired' : 'upstream_rejected',
        });
      }

      const data = await res.json();
      if (data.code !== 200 || !data.result?.id) {
        const msg = data.message || 'Failed to create topic';
        const kind = msg.includes('权限') || msg.includes('D0010') ? 'auth_expired' : 'upstream_rejected';
        throw new UpstreamError(msg, { kind, status: 502 });
      }

      this.markHealthy();
      return data.result.id;
    } catch (error) {
      if (error instanceof UpstreamError) {
        this.markFailure(error.kind);
        throw error;
      }
      this.markFailure('upstream_unavailable');
      throw new UpstreamError(error.message, { kind: 'upstream_unavailable', cause: error });
    } finally {
      linked.dispose();
    }
  }

  async sendMessage({ topicId, content, signal }) {
    const linked = createLinkedTimeoutSignal(signal, this.config.upstreamTimeoutMs);
    try {
      const body = {
        topicId,
        messages: [],
        content,
        contentFiles: [],
      };

      const res = await this.fetch(this.url('/chatapi/chat/message'), {
        method: 'POST',
        headers: this.headers({ json: true }),
        body: JSON.stringify(body),
        signal: linked.signal,
      });

      if (!res.ok) {
        throw new UpstreamError(`Send message failed with HTTP ${res.status}`, {
          status: res.status,
          kind: res.status === 401 ? 'auth_expired' : 'upstream_rejected',
        });
      }

      const data = await res.json();
      if (data.code !== 200 || !data.result?.[1]) {
        const msg = data.message || 'Failed to send message';
        const kind = msg.includes('权限') || msg.includes('D0010') ? 'auth_expired' : 'upstream_rejected';
        throw new UpstreamError(msg, { kind, status: 502 });
      }

      return data.result[1]; // botMsgId
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      throw new UpstreamError(error.message, { kind: 'upstream_unavailable', cause: error });
    } finally {
      linked.dispose();
    }
  }

  async *streamMessage({ botMsgId, signal }) {
    const linked = createLinkedTimeoutSignal(signal, this.config.upstreamTimeoutMs);
    try {
      const res = await this.fetch(this.url(`/chatapi/chat/message/${botMsgId}`), {
        method: 'POST',
        headers: this.headers({ json: true }),
        signal: linked.signal,
      });

      if (!res.ok) {
        throw new UpstreamError(`Stream message failed with HTTP ${res.status}`, {
          status: res.status,
          kind: 'upstream_rejected',
        });
      }

      if (!res.body) {
        throw new UpstreamError('Stream response has no body', { kind: 'upstream_unavailable' });
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) yield chunk;
        }
      } finally {
        reader.releaseLock?.();
      }
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      throw new UpstreamError(error.message, { kind: 'upstream_unavailable', cause: error });
    } finally {
      linked.dispose();
    }
  }

  async deleteTopic({ topicId, signal } = {}) {
    if (!topicId) return;
    try {
      await this.fetch(this.url(`/chatapi/chat/${topicId}`), {
        method: 'POST',
        headers: this.headers({ json: true }),
        body: JSON.stringify({}),
        signal,
      });
    } catch (error) {
      this.logger?.warn('delete_topic_failed', { topicId, error: error.message });
    }
  }
}
