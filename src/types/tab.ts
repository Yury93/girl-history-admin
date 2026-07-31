/**
 * Контракт вкладки. Вынесен из app.ts, чтобы компоненты не импортировали ничего из
 * оболочки — иначе получается кольцо «оболочка → компонент → оболочка».
 */
export interface TabComponent {
  /** Открытие вкладки: загрузка и отрисовка данных. */
  activate(): Promise<void>;
  /**
   * Уход с вкладки: остановить таймеры и подписки. Необязателен, но обязателен для всего,
   * что опрашивает сервер, — иначе поллинг переживёт переключение и будет копиться.
   */
  deactivate?(): void;
}

/**
 * Имена вкладок живут здесь же, а не в app.ts: словарь подсказок и переходы между
 * экранами типизируются по `TabName`, и импорт из оболочки замкнул бы то самое кольцо.
 */
export const TAB_NAMES = [
  'character',
  'modes',
  'week-grid',
  'pools',
  'deviations',
  'locations',
  'references',
  'arc',
  'generation',
  'feed',
  'registry',
  'trends',
  'settings',
] as const;

export type TabName = (typeof TAB_NAMES)[number];

export function isTabName(value: string): value is TabName {
  return (TAB_NAMES as readonly string[]).includes(value);
}

/**
 * Переход на другую вкладку из компонента — событием, а не вызовом App: прямой вызов
 * потребовал бы импорта оболочки. Оболочка подписана на это событие в setupTabs().
 */
export const GOTO_TAB_EVENT = 'nova:goto-tab';

export function gotoTab(tab: TabName): void {
  document.dispatchEvent(new CustomEvent<TabName>(GOTO_TAB_EVENT, { detail: tab }));
}
