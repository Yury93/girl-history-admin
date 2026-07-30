import client from './http.js';
import type {
  Arc,
  CalendarEvent,
  Character,
  CharacterRevision,
  DayPlan,
  DayPlanBrief,
  Deviation,
  EngineLocation,
  EngineSettings,
  GenerationRun,
  ImportReport,
  MonthlyPlan,
  Paged,
  Pool,
  PoolAlert,
  PoolItem,
  Post,
  PromptRun,
  PromptTemplate,
  ReferenceImage,
  RegistryRow,
  Rubric,
  SocialEvent,
  TrendBrief,
  WardrobeLook,
  WeekGridDay,
} from '../types/engine.js';

/**
 * Клиент API движка, сгруппированный по разделам админки.
 *
 * Один файл вместо пятнадцати: каждая группа — это 3-6 однострочных вызовов, и
 * раскладывание их по отдельным модулям дало бы пятнадцать файлов импортов ради
 * шестидесяти строк тела. Границы групп при этом сохранены — компоненты берут ровно
 * свою и в чужую не заглядывают.
 */

// ─── Импорт справочников ──────────────────────────────────────────────────────

export const SeedApi = {
  async import(mode: 'missing' | 'overwrite'): Promise<ImportReport> {
    const { data } = await client.post<ImportReport>('/engine/seed/import', { mode });
    return data;
  },
};

// ─── Персонаж ─────────────────────────────────────────────────────────────────

export const CharacterApi = {
  async get(): Promise<Character> {
    const { data } = await client.get<Character>('/engine/character');
    return data;
  },
  async update(payload: Record<string, unknown>): Promise<Character> {
    const { data } = await client.put<Character>('/engine/character', payload);
    return data;
  },
  async revisions(): Promise<CharacterRevision[]> {
    const { data } = await client.get<CharacterRevision[]>('/engine/character/revisions');
    return data;
  },
};

// ─── Режимы, календарь, правила реализма ──────────────────────────────────────

export const ModesApi = {
  async list(): Promise<import('../types/engine.js').Mode[]> {
    const { data } = await client.get<import('../types/engine.js').Mode[]>('/engine/modes');
    return data;
  },
  async create(payload: Record<string, unknown>): Promise<void> {
    await client.post('/engine/modes', payload);
  },
  async update(key: string, payload: Record<string, unknown>): Promise<void> {
    await client.put(`/engine/modes/${encodeURIComponent(key)}`, payload);
  },
  async remove(key: string, force = false): Promise<void> {
    await client.delete(`/engine/modes/${encodeURIComponent(key)}${force ? '?force=true' : ''}`);
  },

  async events(): Promise<CalendarEvent[]> {
    const { data } = await client.get<CalendarEvent[]>('/engine/calendar-events');
    return data;
  },
  async createEvent(payload: Record<string, unknown>): Promise<void> {
    await client.post('/engine/calendar-events', payload);
  },
  async updateEvent(id: number, payload: Record<string, unknown>): Promise<void> {
    await client.put(`/engine/calendar-events/${id}`, payload);
  },
  async removeEvent(id: number): Promise<void> {
    await client.delete(`/engine/calendar-events/${id}`);
  },

  async realismRules(): Promise<string[]> {
    const { data } = await client.get<{ rules: string[] }>('/engine/realism-rules');
    return data.rules;
  },
  async saveRealismRules(rules: string[]): Promise<void> {
    await client.put('/engine/realism-rules', { rules });
  },
};

// ─── Сетка недели ─────────────────────────────────────────────────────────────

export const WeekGridApi = {
  async list(mode?: string): Promise<WeekGridDay[]> {
    const { data } = await client.get<WeekGridDay[]>('/engine/week-grid', {
      params: mode === undefined ? {} : { mode },
    });
    return data;
  },
  async saveDay(
    modeKey: string,
    weekday: string,
    payload: { title: string; slots: unknown[] }
  ): Promise<void> {
    await client.put(
      `/engine/week-grid/${encodeURIComponent(modeKey)}/${encodeURIComponent(weekday)}`,
      payload
    );
  },
};

// ─── Пулы ─────────────────────────────────────────────────────────────────────

export const PoolsApi = {
  async list(): Promise<Pool[]> {
    const { data } = await client.get<Pool[]>('/engine/pools');
    return data;
  },
  async get(key: string): Promise<Pool> {
    const { data } = await client.get<Pool>(`/engine/pools/${encodeURIComponent(key)}`);
    return data;
  },
  async create(payload: Record<string, unknown>): Promise<void> {
    await client.post('/engine/pools', payload);
  },
  async update(key: string, payload: Record<string, unknown>): Promise<void> {
    await client.put(`/engine/pools/${encodeURIComponent(key)}`, payload);
  },
  async remove(key: string, force = false): Promise<void> {
    await client.delete(`/engine/pools/${encodeURIComponent(key)}${force ? '?force=true' : ''}`);
  },
  async createItem(poolKey: string, payload: Record<string, unknown>): Promise<PoolItem> {
    const { data } = await client.post<PoolItem>(
      `/engine/pools/${encodeURIComponent(poolKey)}/items`,
      payload
    );
    return data;
  },
  async updateItem(
    poolKey: string,
    itemId: number,
    payload: Record<string, unknown>
  ): Promise<void> {
    await client.put(`/engine/pools/${encodeURIComponent(poolKey)}/items/${itemId}`, payload);
  },
  async removeItem(poolKey: string, itemId: number): Promise<void> {
    await client.delete(`/engine/pools/${encodeURIComponent(poolKey)}/items/${itemId}`);
  },

  async alerts(all = false): Promise<PoolAlert[]> {
    const { data } = await client.get<PoolAlert[]>('/engine/pool-alerts', {
      params: all ? { all: 'true' } : {},
    });
    return data;
  },
  async resolveAlert(id: number): Promise<void> {
    await client.post(`/engine/pool-alerts/${id}/resolve`);
  },
};

// ─── Отклонения и социальные события ──────────────────────────────────────────

export const DeviationsApi = {
  async list(): Promise<Deviation[]> {
    const { data } = await client.get<Deviation[]>('/engine/deviations');
    return data;
  },
  async create(payload: Record<string, unknown>): Promise<void> {
    await client.post('/engine/deviations', payload);
  },
  async update(key: string, payload: Record<string, unknown>): Promise<void> {
    await client.put(`/engine/deviations/${encodeURIComponent(key)}`, payload);
  },
  async remove(key: string): Promise<void> {
    await client.delete(`/engine/deviations/${encodeURIComponent(key)}`);
  },

  async social(): Promise<SocialEvent[]> {
    const { data } = await client.get<SocialEvent[]>('/engine/social-events');
    return data;
  },
  async updateSocial(key: string, payload: Record<string, unknown>): Promise<void> {
    await client.put(`/engine/social-events/${encodeURIComponent(key)}`, payload);
  },
  async removeSocial(key: string): Promise<void> {
    await client.delete(`/engine/social-events/${encodeURIComponent(key)}`);
  },
};

// ─── Локации и гардероб ───────────────────────────────────────────────────────

export const LocationsApi = {
  async list(): Promise<EngineLocation[]> {
    const { data } = await client.get<EngineLocation[]>('/engine/locations');
    return data;
  },
  async create(payload: Record<string, unknown>): Promise<void> {
    await client.post('/engine/locations', payload);
  },
  async update(key: string, payload: Record<string, unknown>): Promise<void> {
    await client.put(`/engine/locations/${encodeURIComponent(key)}`, payload);
  },
  async remove(key: string, force = false): Promise<void> {
    await client.delete(
      `/engine/locations/${encodeURIComponent(key)}${force ? '?force=true' : ''}`
    );
  },

  async looks(): Promise<WardrobeLook[]> {
    const { data } = await client.get<WardrobeLook[]>('/engine/wardrobe');
    return data;
  },
  async createLook(payload: Record<string, unknown>): Promise<void> {
    await client.post('/engine/wardrobe', payload);
  },
  async updateLook(key: string, payload: Record<string, unknown>): Promise<void> {
    await client.put(`/engine/wardrobe/${encodeURIComponent(key)}`, payload);
  },
  async removeLook(key: string): Promise<void> {
    await client.delete(`/engine/wardrobe/${encodeURIComponent(key)}`);
  },
};

// ─── Референсы ────────────────────────────────────────────────────────────────

export const ReferencesApi = {
  async list(): Promise<ReferenceImage[]> {
    const { data } = await client.get<ReferenceImage[]>('/engine/references');
    return data;
  },
  async create(payload: Record<string, unknown>): Promise<void> {
    await client.post('/engine/references', payload);
  },
  async upload(key: string, file: File): Promise<ReferenceImage> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await client.post<ReferenceImage>(
      `/engine/references/${encodeURIComponent(key)}/file`,
      form
    );
    return data;
  },
  async removeFile(key: string): Promise<void> {
    await client.delete(`/engine/references/${encodeURIComponent(key)}/file`);
  },
  async markEtalon(key: string): Promise<void> {
    await client.post(`/engine/references/${encodeURIComponent(key)}/etalon`);
  },
  async remove(key: string, force = false): Promise<void> {
    await client.delete(
      `/engine/references/${encodeURIComponent(key)}${force ? '?force=true' : ''}`
    );
  },
  async createSoulId(): Promise<ReferenceImage> {
    const { data } = await client.post<ReferenceImage>('/engine/references/etalon/soul');
    return data;
  },
  async rules(): Promise<string[]> {
    const { data } = await client.get<{ rules: string[] }>('/engine/references/rules');
    return data.rules;
  },
  async saveRules(rules: string[]): Promise<void> {
    await client.put('/engine/references/rules', { rules });
  },
};

// ─── Арка ─────────────────────────────────────────────────────────────────────

export const ArcApi = {
  async get(): Promise<Arc> {
    const { data } = await client.get<Arc>('/engine/arc');
    return data;
  },
  async save(payload: Record<string, unknown>): Promise<Arc> {
    const { data } = await client.put<Arc>('/engine/arc', payload);
    return data;
  },
};

// ─── Рубрики, шаблоны, настройки ──────────────────────────────────────────────

export const SettingsApi = {
  async rubrics(): Promise<Rubric[]> {
    const { data } = await client.get<Rubric[]>('/engine/rubrics');
    return data;
  },
  async templates(): Promise<PromptTemplate[]> {
    const { data } = await client.get<PromptTemplate[]>('/engine/prompt-templates');
    return data;
  },
  async saveTemplate(key: string, body: string): Promise<void> {
    await client.put(`/engine/prompt-templates/${encodeURIComponent(key)}`, { body });
  },
  async get(): Promise<EngineSettings> {
    const { data } = await client.get<EngineSettings>('/engine/settings');
    return data;
  },
  async update(payload: Partial<EngineSettings>): Promise<EngineSettings> {
    const { data } = await client.put<EngineSettings>('/engine/settings', payload);
    return data;
  },
};

// ─── Генерация ────────────────────────────────────────────────────────────────

export const GenerationApi = {
  async generateDay(payload: Record<string, unknown>): Promise<{ runId: number }> {
    const { data } = await client.post<{ runId: number }>('/engine/generate/day', payload);
    return data;
  },
  async generateWeek(payload: Record<string, unknown>): Promise<{ runId: number }> {
    const { data } = await client.post<{ runId: number }>('/engine/generate/week', payload);
    return data;
  },
  async runs(limit = 20): Promise<GenerationRun[]> {
    const { data } = await client.get<GenerationRun[]>('/engine/runs', { params: { limit } });
    return data;
  },
  async run(id: number): Promise<GenerationRun> {
    const { data } = await client.get<GenerationRun>(`/engine/runs/${id}`);
    return data;
  },
  async dayPlans(from: string, to: string): Promise<DayPlanBrief[]> {
    const { data } = await client.get<DayPlanBrief[]>('/engine/day-plans', {
      params: { from, to },
    });
    return data;
  },
  async dayPlan(date: string): Promise<DayPlan> {
    const { data } = await client.get<DayPlan>(`/engine/day-plans/${date}`);
    return data;
  },
  async monthlyPlan(month: string): Promise<MonthlyPlan> {
    const { data } = await client.get<MonthlyPlan>('/engine/monthly-plan', { params: { month } });
    return data;
  },
  async generateMonthlyPlan(month: string): Promise<MonthlyPlan> {
    const { data } = await client.post<MonthlyPlan>('/engine/monthly-plan', { month });
    return data;
  },
};

// ─── Реестр вариаций ──────────────────────────────────────────────────────────

export const RegistryApi = {
  async list(params: Record<string, string | number>): Promise<Paged<RegistryRow>> {
    const { data } = await client.get<Paged<RegistryRow>>('/engine/registry', { params });
    return data;
  },
};

// ─── Посты ────────────────────────────────────────────────────────────────────

export const PostsApi = {
  async list(params: Record<string, string | number>): Promise<Paged<Post>> {
    const { data } = await client.get<Paged<Post>>('/engine/posts', { params });
    return data;
  },
  async get(id: number): Promise<Post> {
    const { data } = await client.get<Post>(`/engine/posts/${id}`);
    return data;
  },
  async update(id: number, payload: Record<string, unknown>): Promise<Post> {
    const { data } = await client.patch<Post>(`/engine/posts/${id}`, payload);
    return data;
  },
  async changeStatus(id: number, status: string, force = false): Promise<Post> {
    const { data } = await client.post<Post>(`/engine/posts/${id}/status`, { status, force });
    return data;
  },
  async regenerateText(id: number): Promise<Post> {
    const { data } = await client.post<Post>(`/engine/posts/${id}/regenerate-text`, {});
    return data;
  },
  async generateImage(id: number): Promise<Post> {
    const { data } = await client.post<Post>(`/engine/posts/${id}/image`);
    return data;
  },
  async remove(id: number): Promise<void> {
    await client.delete(`/engine/posts/${id}`);
  },
  async promptRuns(postId: number): Promise<PromptRun[]> {
    const { data } = await client.get<PromptRun[]>('/engine/prompt-runs', { params: { postId } });
    return data;
  },
};

// ─── Тренды ───────────────────────────────────────────────────────────────────

export const TrendsApi = {
  async list(params: Record<string, string | number> = {}): Promise<Paged<TrendBrief>> {
    const { data } = await client.get<Paged<TrendBrief>>('/engine/trends', { params });
    return data;
  },
  async create(payload: Record<string, unknown>): Promise<void> {
    await client.post('/engine/trends', payload);
  },
  async update(id: number, payload: Record<string, unknown>): Promise<void> {
    await client.put(`/engine/trends/${id}`, payload);
  },
  async remove(id: number): Promise<void> {
    await client.delete(`/engine/trends/${id}`);
  },
};
