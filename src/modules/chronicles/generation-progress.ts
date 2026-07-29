import { ChroniclePublicApi } from '../../api/chronicle-public-api.js';
import { isJobActive } from '../../types/job.js';
import type { ChronicleStatusFull } from '../../types/chronicle.js';

/**
 * Поллинг статуса генерации.
 *
 * Вынесен из компонента, потому что здесь три неочевидные вещи, и все три план
 * первой редакции понимал неверно (frontend_plan.md §4, пункты 34-35):
 *
 *  1. `generatedDays` — это `count` ВСЕХ дней хроники, а `totalDays` при выборочной
 *     регенерации равен длине выбранного диапазона. Делить одно на другое — получить
 *     «30 из 3». Годится только когда `totalDays === periodDays`, то есть генерация полная.
 *  2. `doneDays` растёт по завершении сюжетной ЛИНИИ, а не по дню, поэтому прыгает
 *     кусками до десяти делений — но при выборочной регенерации это единственное, что есть.
 *  3. `doneDays` НЕ обязан дойти до `totalDays`: отредактированные руками дни пропускаются,
 *     а в `totalDays` посчитаны. Завершение определяем ТОЛЬКО по полю `status`.
 */

/** Пауза между опросами. Чтение не лимитируется, но чаще смысла нет: линия идёт секунды. */
const POLL_MS = 2000;

/** Сколько подряд идущих ошибок терпим, прежде чем сдаться. */
const MAX_ERRORS = 3;

export interface ProgressView {
  status: ChronicleStatusFull;
  /** Доля выполнения 0..100, либо null — когда посчитать честно нельзя. */
  percent: number | null;
  /** Пояснение под полосой: что именно сейчас происходит. */
  label: string;
}

/**
 * Процент выполнения. `periodDays` берётся из хроники — без него режим генерации
 * не отличить.
 */
export function progressPercent(status: ChronicleStatusFull, periodDays: number): number | null {
  const isFullRun = status.totalDays === periodDays;

  if (isFullRun) {
    if (periodDays <= 0) return null;
    // Полная генерация: реальное число записанных дней — самая плавная метрика.
    return clampPercent((status.generatedDays / periodDays) * 100);
  }

  // Выборочная регенерация: generatedDays считает всю хронику и к totalDays отношения
  // не имеет. Остаётся doneDays — грубо, зато не врёт.
  if (status.totalDays <= 0) return null;
  return clampPercent((status.doneDays / status.totalDays) * 100);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function progressLabel(status: ChronicleStatusFull, periodDays: number): string {
  switch (status.status) {
    case 'pending':
      return 'В очереди…';
    case 'running':
      if (status.stage === 'skeleton') {
        return 'Строится каркас: модель раскладывает период на сюжетные линии.';
      }
      return status.totalDays === periodDays
        ? `Написано дней: ${status.generatedDays} из ${periodDays}.`
        : `Перегенерировано: ${status.doneDays} из ${status.totalDays}.`;
    case 'done':
      return 'Готово.';
    case 'partial':
      // Не провал: часть дней записана и осталась на месте.
      return `Записано ${status.doneDays} из ${status.totalDays} — остальное не дошло. Повтор дозаполнит недостающее.`;
    case 'failed':
      return status.error ?? 'Генерация не удалась.';
    default:
      return '';
  }
}

export function buildProgressView(status: ChronicleStatusFull, periodDays: number): ProgressView {
  return {
    status,
    percent: progressPercent(status, periodDays),
    label: progressLabel(status, periodDays),
  };
}

/**
 * Один активный опрос за раз. Таймер обязан останавливаться при уходе с вкладки,
 * смене профиля и удалении хроники — иначе они копятся при каждом пересоздании
 * компонента и через десяток переключений сервер опрашивают пачкой.
 */
export class GenerationProgress {
  private timer: number | null = null;
  private token: string | null = null;
  private errors = 0;

  get isRunning(): boolean {
    return this.timer !== null;
  }

  /** Токен хроники, за которой сейчас следим. */
  get watching(): string | null {
    return this.token;
  }

  start(
    publicToken: string,
    periodDays: number,
    onUpdate: (view: ProgressView) => void,
    onFinish: (view: ProgressView) => void
  ): void {
    this.stop();
    this.token = publicToken;
    this.errors = 0;

    const tick = async (): Promise<void> => {
      // Между запросом и ответом мог прийти stop() — тогда результат уже не наш.
      if (this.token !== publicToken) return;

      try {
        const status = await ChroniclePublicApi.getStatus(publicToken);
        if (this.token !== publicToken) return;

        this.errors = 0;
        const view = buildProgressView(status, periodDays);

        // Завершение — ТОЛЬКО по статусу. Счётчики до конца дойти не обязаны.
        if (!isJobActive(status.status)) {
          this.stop();
          onFinish(view);
          return;
        }
        onUpdate(view);
      } catch {
        this.errors += 1;
        if (this.errors >= MAX_ERRORS) this.stop();
      }
    };

    void tick();
    this.timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.token = null;
  }
}
