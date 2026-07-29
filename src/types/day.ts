/** Зеркало girl-history/src/dtos/day-dto.ts. */

export interface Day {
  dayIndex: number;
  /**
   * `YYYY-MM-DD`. Дату и день недели считает сервер от `startDate` в UTC
   * (chronicle-service.ts:214-222) — на клиенте НЕ пересчитывать, разъедется на границе суток.
   */
  date: string;
  weekday: string;
  title: string;
  text: string;
  mood: string | null;
  activityTags: string[];
  /** Правил человек → регенерация этот день пропускает, пока не сказано перезаписать. */
  isEdited: boolean;
  /** Возвращается назад при правке — оптимистичная блокировка. */
  updatedAt: string;
}

export interface DayList {
  items: Day[];
  /**
   * ВНИМАНИЕ: это длина уже отфильтрованной выборки, а не число дней в хронике
   * (chronicle-controller.ts:43). Для пагинации непригодно.
   */
  total: number;
}

export interface UpdateDayInput {
  title?: string;
  text?: string;
  mood?: string | null;
  activityTags?: string[];
  /**
   * Прочитанный клиентом `updatedAt`, полный ISO с временем (day-dto.ts:26).
   * НЕ путать с `startDate` хроники — там `YYYY-MM-DD`.
   * Ответ возвращает НОВЫЙ `updatedAt`: не записав его обратно, следующая правка получит 409.
   */
  expectedUpdatedAt: string;
}
