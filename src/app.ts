/**
 * Оболочка приложения: сайдбар с профилями + вкладки внутри выбранного профиля.
 *
 * Схема взята из ai-prompt-admin (сайдбар слева, вкладки справа), но с двумя правками:
 *  - вместо цепочки else-if по имени вкладки — таблица фабрик, иначе она растёт линейно
 *    с числом вкладок (в админке уже 10 веток подряд);
 *  - в контракте компонента есть deactivate(): без него таймеры поллинга статуса генерации
 *    продолжали бы работать после ухода с вкладки и копились бы при каждом переключении.
 */

const TAB_NAMES = ['persona', 'images', 'chronicles', 'days'] as const;
export type TabName = (typeof TAB_NAMES)[number];

/** Контракт вкладки. Компоненты создаются лениво и переиспользуются. */
export interface TabComponent {
  /** Открытие вкладки: загрузка и отрисовка данных. */
  activate(): Promise<void>;
  /** Уход с вкладки: остановить таймеры и подписки. Необязателен. */
  deactivate?(): void;
}

const LAST_TAB_KEY = 'gh-admin:last-tab';

function isTabName(value: string): value is TabName {
  return (TAB_NAMES as readonly string[]).includes(value);
}

class App {
  private readonly components = new Map<TabName, TabComponent>();
  private readonly factories: Record<TabName, () => TabComponent>;
  private activeTab: TabName | null = null;

  constructor() {
    // Пока фазы 2-4 не написаны, вкладки показывают честную заглушку.
    // Каждая фаза заменяет свою строку на реальный компонент — оболочку не трогая.
    this.factories = {
      persona: () => placeholder('tab-persona', 'Профиль', 'правка промпта, внешности и аватара'),
      images: () => placeholder('tab-images', 'Референсы', 'фото, влияющие на генерацию'),
      chronicles: () => placeholder('tab-chronicles', 'Хроники', 'запуск генерации и прогресс'),
      days: () => placeholder('tab-days', 'Лента', 'дни хроники, правка и регенерация'),
    };

    this.setupTabs();
    void this.activateTab(this.restoreTab());
  }

  private restoreTab(): TabName {
    const saved = localStorage.getItem(LAST_TAB_KEY);
    return saved !== null && isTabName(saved) ? saved : 'persona';
  }

  private setupTabs(): void {
    document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.tab;
        if (name !== undefined && isTabName(name)) void this.activateTab(name);
      });
    });
  }

  private async activateTab(name: TabName): Promise<void> {
    if (this.activeTab === name) return;

    // Сначала гасим прошлую вкладку — иначе её поллинг продолжит жить в фоне.
    if (this.activeTab !== null) {
      this.components.get(this.activeTab)?.deactivate?.();
    }

    this.activeTab = name;
    localStorage.setItem(LAST_TAB_KEY, name);

    document.querySelectorAll<HTMLElement>('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });
    document.querySelectorAll<HTMLElement>('.tab-content').forEach((el) => {
      el.classList.toggle('active', el.id === `tab-${name}`);
    });

    let component = this.components.get(name);
    if (component === undefined) {
      component = this.factories[name]();
      this.components.set(name, component);
    }
    await component.activate();
  }
}

/** Временная заглушка вкладки. Убирается вместе с приходом настоящего компонента. */
function placeholder(containerId: string, title: string, what: string): TabComponent {
  return {
    activate(): Promise<void> {
      const el = document.getElementById(containerId);
      if (el !== null) {
        el.innerHTML = `
          <div class="empty">
            <div class="icon">🚧</div>
            <div class="title">${title}</div>
            <div class="desc">Здесь будет ${what}. Компонент ещё не реализован.</div>
          </div>`;
      }
      return Promise.resolve();
    },
  };
}

new App();
