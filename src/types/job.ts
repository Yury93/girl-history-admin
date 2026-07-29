/**
 * Состояние фоновой генерации. Зеркало girl-history/src/repositories/job/job-repository.ts:3-4
 * и services/llm/llm-service-interface.ts:4-5.
 */

/**
 * `partial` — НЕ провал: часть дней записана и осталась на месте, повтор дозаполнит
 * недостающие (generation-service.ts:107). В интерфейсе это должно выглядеть иначе,
 * чем `failed`, иначе пользователь удалит хронику и начнёт заново без причины.
 */
export const JOB_STATUSES = ['pending', 'running', 'done', 'failed', 'partial'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Скелет сюжетных линий строится первым, дни — вторым проходом. */
export const JOB_STAGES = ['skeleton', 'days'] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const LLM_PROVIDERS = ['claude', 'deepseek'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** Генерация ещё идёт: запуск других генераций и правка дней сейчас вернут 409. */
export function isJobActive(status: JobStatus): boolean {
  return status === 'pending' || status === 'running';
}
