import http from './http.js';
import type { ChroniclePublic, ChronicleStatusFull } from '../types/chronicle.js';
import type { DayList } from '../types/day.js';

/**
 * Чтение хроники по `publicToken`.
 *
 * Это НЕ «задел под публичную страницу»: у владельца собственного GET для дней не существует
 * (в OwnerChronicleController нет ни одного @GET), поэтому админка читает ленту, линии и
 * статус именно отсюда. `publicToken` берётся из `ChronicleSummary.publicToken`.
 *
 * Эти маршруты не лимитируются — лимитеры навешены только на пишущие, поэтому поллинг
 * статуса безопасен и лимит генерации не ест.
 */
export const ChroniclePublicApi = {
  /** Хроника целиком: персона (без промпта), линии, дни, статус. */
  async get(publicToken: string): Promise<ChroniclePublic> {
    const response = await http.get<ChroniclePublic>(
      `/chronicles/${encodeURIComponent(publicToken)}`
    );
    return response.data;
  },

  /** Выбор дней по диапазону индексов. `total` в ответе — длина выборки, не всего хроники. */
  async listDays(publicToken: string, from?: number, to?: number): Promise<DayList> {
    const response = await http.get<DayList>(
      `/chronicles/${encodeURIComponent(publicToken)}/days`,
      { params: { from, to } }
    );
    return response.data;
  },

  /** Лёгкий поллинг прогресса: без тел дней. */
  async getStatus(publicToken: string): Promise<ChronicleStatusFull> {
    const response = await http.get<ChronicleStatusFull>(
      `/chronicles/${encodeURIComponent(publicToken)}/status`
    );
    return response.data;
  },
};
