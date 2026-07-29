import http from './http.js';
import type {
  CreateChronicleInput,
  CreatedChronicle,
  RegenerateInput,
} from '../types/chronicle.js';
import type { Day, UpdateDayInput } from '../types/day.js';

/**
 * Владельческие операции над хрониками и днями. Всё под `/personas/:ownerToken/...` —
 * так `publicToken` и `ownerToken` никогда не оказываются в одной позиции пути.
 *
 * План бэкенда (profile-generation_plan.md:268) показывает эти маршруты под `/chronicles/…` —
 * это неверно, в коде они под `/personas/…` (owner-chronicle-controller.ts:14).
 *
 * GET здесь нет вовсе: чтение дней и статуса — только по `publicToken`,
 * см. chronicle-public-api.ts.
 */
export const ChronicleApi = {
  /**
   * Запуск генерации. Отвечает 202 и только `{ id, publicToken }` — дней в ответе нет,
   * прогресс опрашивается отдельно по `publicToken`.
   */
  async create(ownerToken: string, input: CreateChronicleInput): Promise<CreatedChronicle> {
    const response = await http.post<CreatedChronicle>(
      `/personas/${encodeURIComponent(ownerToken)}/chronicles`,
      input
    );
    return response.data;
  },

  /**
   * Выборочная регенерация. Пустой `dayIndexes` — вся хроника.
   * `overwriteEdited` по умолчанию false: иначе повтор затрёт ручные правки.
   */
  async regenerate(
    ownerToken: string,
    chronicleId: number,
    input: RegenerateInput = {}
  ): Promise<void> {
    await http.post(
      `/personas/${encodeURIComponent(ownerToken)}/chronicles/${chronicleId}/regenerate`,
      input
    );
  },

  async remove(ownerToken: string, chronicleId: number): Promise<void> {
    await http.delete(`/personas/${encodeURIComponent(ownerToken)}/chronicles/${chronicleId}`);
  },

  /**
   * Правка дня. Требует `expectedUpdatedAt` — прочитанный клиентом `updatedAt`.
   * Ответ несёт НОВЫЙ `updatedAt`: его обязательно записать обратно в модель дня,
   * иначе вторая правка подряд получит 409.
   *
   * Два разных 409: «день изменился с момента загрузки» (day-service.ts:51-55) и
   * «по хронике идёт генерация» (day-service.ts:30-35) — различать по тексту.
   */
  async updateDay(
    ownerToken: string,
    chronicleId: number,
    dayIndex: number,
    input: UpdateDayInput
  ): Promise<Day> {
    const response = await http.patch<Day>(
      `/personas/${encodeURIComponent(ownerToken)}/chronicles/${chronicleId}/days/${dayIndex}`,
      input
    );
    return response.data;
  },
};
