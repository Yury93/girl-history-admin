/// <reference types="vite/client" />

/**
 * Переменные сборки. Без этих объявлений `import.meta.env.VITE_*` имеет тип `any`
 * (в типах vite/client стоит индексная сигнатура), и линт справедливо ругается
 * на небезопасный доступ — а `any` в проекте запрещён.
 *
 * Напоминание: всё с префиксом VITE_ вшивается в бандл и видно в исходниках страницы.
 * Секретам здесь не место, только адреса.
 */
interface ImportMetaEnv {
  /** Базовый путь API: дев `/api`, прод `/girl-history`. */
  readonly VITE_API_BASE?: string;
  /** Куда dev-сервер проксирует запросы. Читается только в vite.config.ts. */
  readonly VITE_API_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
