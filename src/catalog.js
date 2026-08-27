const FALLBACK_MODELS = [
  'claude-3-7-sonnet-20250219-vip',
  'claude-3-5-sonnet-20241022-vip',
  'claude-3-5-haiku-20241022-vip',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o-2024-11-20',
  'gpt-5-nano',
  'deepseek-chat',
  'deepseek-v3-vip',
  'deepseek-v3.2-vip',
  'deepseek-v3.2-think-vip',
  'deepseek-r1-vip',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite-preview',
  'grok-3',
  'grok-3-reasoning',
  'ouyi-chat',
  'deepseek-v4-flash'
];

export class ModelCatalog {
  constructor(client, { ttlMs = 10 * 60 * 1000, logger } = {}) {
    this.client = client;
    this.ttlMs = ttlMs;
    this.logger = logger;
    this.cachedModels = null;
    this.lastFetchedAt = 0;
    this.inFlight = null;
  }

  status() {
    return {
      count: this.cachedModels?.length ?? 0,
      lastFetchedAt: this.lastFetchedAt || null,
      isStale: Date.now() - this.lastFetchedAt > this.ttlMs,
    };
  }

  async get({ signal, allowStale = true } = {}) {
    const isStale = Date.now() - this.lastFetchedAt > this.ttlMs;
    if (this.cachedModels && (!isStale || allowStale)) {
      if (isStale && !this.inFlight) {
        this.refresh({ signal }).catch(() => {});
      }
      return this.cachedModels;
    }
    return this.refresh({ signal });
  }

  async refresh({ signal } = {}) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      try {
        const models = await this.client.fetchModelCatalog({ signal });
        const list = Array.isArray(models) && models.length > 0 ? models : FALLBACK_MODELS;
        this.cachedModels = [...new Set(list)];
        this.lastFetchedAt = Date.now();
        this.logger?.info('catalog_refreshed', { count: this.cachedModels.length });
        return this.cachedModels;
      } catch (error) {
        this.logger?.warn('catalog_refresh_failed', { error: error.message });
        if (this.cachedModels) return this.cachedModels;
        this.cachedModels = FALLBACK_MODELS;
        return this.cachedModels;
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  async validateModel(modelId, { signal } = {}) {
    const models = await this.get({ signal });
    if (!modelId) return models[0];
    const match = models.find((m) => m.toLowerCase() === modelId.toLowerCase());
    return match ?? modelId;
  }

  async formatOpenAIList({ signal } = {}) {
    const models = await this.get({ signal });
    const now = Math.floor(Date.now() / 1000);
    return {
      object: 'list',
      data: models.map((id) => ({
        id,
        object: 'model',
        created: now,
        owned_by: 'ouyi',
        permission: [],
        root: id,
        parent: null,
      })),
    };
  }
}
