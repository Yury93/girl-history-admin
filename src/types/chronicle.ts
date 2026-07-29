/** Зеркало girl-history/src/dtos/chronicle-dto.ts. */

import type { Day } from './day.js';
import type { JobStage, JobStatus, LlmProvider } from './job.js';

/** Каркас хроники: линии идут подряд и без пропусков, покрывая весь период. */
export interface StoryLine {
  lineIndex: number;
  title: string;
  startDay: number;
  endDay: number;
  /** Чем линия заканчивается — чтобы дни внутри неё не разъезжались. */
  ending: string;
}

export interface ChronicleStatus {
  status: JobStatus;
  stage: JobStage | null;
  /**
   * Растёт по завершении сюжетной ЛИНИИ, а не по дню (generation-service.ts:99),
   * поэтому прыгает кусками. И НЕ обязан дойти до `totalDays`: отредактированные руками
   * дни пропускаются (generation-service.ts:160), но в `totalDays` посчитаны.
   */
  doneDays: number;
  /**
   * Полная генерация — равен `periodDays` хроники; выборочная регенерация — длине
   * выбранного диапазона (chronicle-service.ts:177). Сравнение с `periodDays` — единственный
   * способ для клиента отличить один режим от другого.
   */
  totalDays: number;
  error: string | null;
}

/** Ответ `/status`: то же плюс реальное число записанных дней. */
export interface ChronicleStatusFull extends ChronicleStatus {
  /**
   * `count` ВСЕХ дней хроники (day-repository.ts:94-96). Годится для прогресса только
   * при полной генерации: при выборочной даст «30 из 3».
   */
  generatedDays: number;
}

/** Публичное представление персонажа: `sourcePrompt` сюда намеренно не попадает. */
export interface PersonaPublic {
  name: string;
  photoUrl: string | null;
}

export interface ChroniclePublic {
  publicToken: string;
  periodDays: number;
  llmProvider: string;
  startDate: string;
  createdAt: string;
  persona: PersonaPublic;
  lines: StoryLine[];
  days: Day[];
  status: ChronicleStatus;
}

/** Сводка в карточке профиля. */
export interface ChronicleSummary {
  id: number;
  /** Нужен не только «чтобы поделиться»: чтение дней идёт только через него. */
  publicToken: string;
  periodDays: number;
  startDate: string;
  createdAt: string;
  status: JobStatus;
  doneDays: number;
  totalDays: number;
  /** Промпт профиля правили ПОСЛЕ генерации — лента может ему противоречить. */
  stale: boolean;
}

export interface CreateChronicleInput {
  /** Целое 1..MAX_PERIOD_DAYS. «Неделя»/«месяц» — только пресеты кнопок. */
  periodDays: number;
  /** `YYYY-MM-DD`, без времени (chronicle-dto.ts:14). */
  startDate?: string;
  promptExtra?: string;
  provider?: LlmProvider;
}

export interface CreatedChronicle {
  id: number;
  publicToken: string;
}

export interface RegenerateInput {
  /** Пусто — вся хроника. Иначе только выбранные dayIndex, не больше 400. */
  dayIndexes?: number[];
  /** По умолчанию false: иначе первый же повтор затрёт ручные правки. */
  overwriteEdited?: boolean;
}
