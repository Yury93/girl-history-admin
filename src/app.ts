import { CharacterComponent } from './modules/character/character-component.js';
import { ModesComponent } from './modules/modes/modes-component.js';
import { WeekGridComponent } from './modules/week-grid/week-grid-component.js';
import { PoolsComponent } from './modules/pools/pools-component.js';
import { DeviationsComponent } from './modules/deviations/deviations-component.js';
import { LocationsComponent } from './modules/locations/locations-component.js';
import { ReferencesComponent } from './modules/references/references-component.js';
import { ArcComponent } from './modules/arc/arc-component.js';
import { GenerationComponent } from './modules/generation/generation-component.js';
import { FeedComponent } from './modules/feed/feed-component.js';
import { RegistryComponent } from './modules/registry/registry-component.js';
import { TrendsComponent } from './modules/trends/trends-component.js';
import { SettingsComponent } from './modules/settings/settings-component.js';
import { getAdminKey, setAdminKey } from './state/admin-key.js';
import { toast } from './ui/toast.js';
import type { TabComponent } from './types/tab.js';

/**
 * Оболочка админки движка.
 *
 * Отличия от прежней версии, оба намеренные:
 *  - сайдбар профилей исчез: персонаж теперь ОДИН, выбирать нечего;
 *  - вкладок стало 13, поэтому они разбиты на две группы («Справочники» и «Работа») —
 *    плоский список в одну строку не влезает.
 *
 * Контракт компонента прежний: ленивое создание + `deactivate()`, без которого поллинг
 * статуса прогона пережил бы переключение вкладки и копился бы при каждом возврате.
 */

const TAB_NAMES = [
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

const LAST_TAB_KEY = 'nova-admin:last-tab';

function isTabName(value: string): value is TabName {
  return (TAB_NAMES as readonly string[]).includes(value);
}

class App {
  private readonly components = new Map<TabName, TabComponent>();
  private readonly factories: Record<TabName, () => TabComponent>;
  private activeTab: TabName | null = null;

  constructor() {
    this.factories = {
      character: () => new CharacterComponent('tab-character'),
      modes: () => new ModesComponent('tab-modes'),
      'week-grid': () => new WeekGridComponent('tab-week-grid'),
      pools: () => new PoolsComponent('tab-pools'),
      deviations: () => new DeviationsComponent('tab-deviations'),
      locations: () => new LocationsComponent('tab-locations'),
      references: () => new ReferencesComponent('tab-references'),
      arc: () => new ArcComponent('tab-arc'),
      generation: () => new GenerationComponent('tab-generation'),
      feed: () => new FeedComponent('tab-feed'),
      registry: () => new RegistryComponent('tab-registry'),
      trends: () => new TrendsComponent('tab-trends'),
      settings: () => new SettingsComponent('tab-settings'),
    };

    this.setupTabs();
    this.setupAdminKey();
    void this.activateTab(this.restoreTab());
  }

  private restoreTab(): TabName {
    const saved = localStorage.getItem(LAST_TAB_KEY);
    return saved !== null && isTabName(saved) ? saved : 'generation';
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
   * Ключ доступа. Сервер его НЕ выдаёт: при заданном `ADMIN_KEY` он просто отвечает 401,
   * пока клиент не пришлёт верный. Поэтому поле для ввода всегда на виду.
   */
  private setupAdminKey(): void {
    const input = document.getElementById('adminKey');
    const button = document.getElementById('saveAdminKey');
    if (!(input instanceof HTMLInputElement) || button === null) return;

    input.value = getAdminKey() ?? '';
    button.addEventListener('click', () => {
      setAdminKey(input.value);
      toast.success(input.value.trim() === '' ? 'Ключ убран' : 'Ключ сохранён');
      const active = this.activeTab;
      if (active !== null) {
        // Переоткрываем текущий экран: с новым ключом данные надо перечитать.
        this.components.delete(active);
        this.activeTab = null;
        void this.activateTab(active);
      }
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

new App();
