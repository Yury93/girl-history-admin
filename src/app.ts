import { store } from './state/app-state.js';
import { PersonasComponent } from './modules/personas/personas-component.js';
import { PersonaComponent } from './modules/persona/persona-component.js';
import { PersonaImagesComponent } from './modules/persona/persona-images-component.js';
import { ChroniclesComponent, OPEN_TAB_EVENT } from './modules/chronicles/chronicles-component.js';
import type { TabComponent } from './types/tab.js';

/**
 * Оболочка: сайдбар с профилями + вкладки внутри выбранного профиля.
 *
 * Схема взята из ai-prompt-admin (сайдбар слева, вкладки справа), но с двумя правками:
 *  - вместо цепочки else-if по имени вкладки — таблица фабрик, иначе она растёт линейно
 *    с числом вкладок (в админке уже 10 веток подряд);
 *  - в контракте компонента есть deactivate(): без него таймеры поллинга статуса генерации
 *    продолжали бы работать после ухода с вкладки и копились бы при каждом переключении.
 */

const TAB_NAMES = ['persona', 'images', 'chronicles', 'days'] as const;
export type TabName = (typeof TAB_NAMES)[number];

/** Вкладки, которым нужен выбранный профиль: без него они бессмысленны. */
const NEEDS_PERSONA: readonly TabName[] = ['images', 'chronicles', 'days'];

const LAST_TAB_KEY = 'gh-admin:last-tab';

function isTabName(value: string): value is TabName {
  return (TAB_NAMES as readonly string[]).includes(value);
}

class App {
  private readonly components = new Map<TabName, TabComponent>();
  private readonly factories: Record<TabName, () => TabComponent>;
  private readonly personas: PersonasComponent;
  private activeTab: TabName | null = null;

  constructor() {
    this.personas = new PersonasComponent();

    this.factories = {
      persona: () => new PersonaComponent('tab-persona'),
      images: () => new PersonaImagesComponent('tab-images'),
      chronicles: () => new ChroniclesComponent('tab-chronicles'),
      // Фаза 4: заменяется на реальный компонент, оболочку трогать не придётся.
      days: () => placeholder('tab-days', 'Лента', 'дни хроники, правка и выборочная регенерация'),
    };

    this.setupTabs();

    // Компоненты просят открыть другую вкладку событием, а не ссылкой на оболочку:
    // иначе «Хроники» пришлось бы знать про App, а App — прокидывать себя в конструктор.
    document.addEventListener(OPEN_TAB_EVENT, (event) => {
      const name = (event as CustomEvent<string>).detail;
      if (isTabName(name)) void this.activateTab(name);
    });

    store.subscribe(() => {
      this.syncTabAvailability();
    });
    this.syncTabAvailability();

    void this.start();
  }

  private async start(): Promise<void> {
    // Сначала вкладка — чтобы пустое состояние отрисовалось сразу, а не после запроса.
    await this.activateTab(this.restoreTab());
    await this.personas.activate();
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

  /**
   * Без выбранного профиля вкладки «Референсы», «Хроники» и «Лента» гасим: они всё равно
   * показали бы только приглашение выбрать профиль. Если гасим ту, что сейчас открыта, —
   * возвращаемся на «Профиль».
   */
  private syncTabAvailability(): void {
    const hasPersona = store.persona !== null;
    document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
      const name = btn.dataset.tab;
      if (name === undefined || !isTabName(name)) return;
      btn.disabled = !hasPersona && NEEDS_PERSONA.includes(name);
    });

    if (!hasPersona && this.activeTab !== null && NEEDS_PERSONA.includes(this.activeTab)) {
      void this.activateTab('persona');
    }
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
