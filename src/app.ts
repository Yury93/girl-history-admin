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
import { getAdminKey, hasAdminKey, setAdminKey } from './state/admin-key.js';
import { PROFILES_CHANGED_EVENT, getProfileId, setProfileId } from './state/profile.js';
import { escapeHtml } from './ui/dom.js';
import { CharactersApi } from './api/engine-api.js';
import { errorText } from './api/http.js';
import { promptDialog } from './ui/prompt-dialog.js';
import { toast } from './ui/toast.js';
import { openGuide } from './ui/guide.js';
import { hideTooltip, initTooltips } from './ui/tooltip.js';
import {
  TUTORIAL_STATE_EVENT,
  initTutorial,
  toggleTutorial,
  tutorialStatus,
} from './ui/tutorial.js';
import {
  GOTO_TAB_EVENT,
  TAB_CHANGED_EVENT,
  isTabName,
  type TabComponent,
  type TabName,
} from './types/tab.js';

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

const LAST_TAB_KEY = 'nova-admin:last-tab';

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
    this.setupHelp();
    this.setupTutorial();
    this.setupProfiles();
    initTooltips();
    initTutorial();
    this.updateHelpButtons();
    void this.activateTab(this.restoreTab());
  }

  /** Пересоздать активный экран — данные надо перечитать (смена ключа или профиля). */
  private reloadActiveScreen(): void {
    const active = this.activeTab;
    if (active === null) return;
    this.components.delete(active);
    this.activeTab = null;
    void this.activateTab(active);
  }

  // ─── Профили персонажей (мультипрофиль) ────────────────────────────────────

  /**
   * Селектор в шапке. Список приходит с бэкенда; ошибка (нет ключа, старый бэкенд)
   * просто прячет селектор — админка продолжает работать с профилем по умолчанию.
   */
  private setupProfiles(): void {
    const picker = document.getElementById('profilePicker');
    const select = document.getElementById('profileSelect');
    const createBtn = document.getElementById('profileCreate');
    if (picker === null || !(select instanceof HTMLSelectElement) || createBtn === null) return;

    select.addEventListener('change', () => {
      const id = Number(select.value);
      setProfileId(Number.isInteger(id) && id > 0 ? id : null);
      this.reloadActiveScreen();
    });

    createBtn.addEventListener('click', () => {
      void (async () => {
        const name = await promptDialog({
          title: 'Новый профиль персонажа',
          message:
            'Профиль получит копию личности текущего дефолтного профиля и полный набор ' +
            'справочников из сида. Генерация, лента и реестр у него будут свои.',
          placeholder: 'Имя, например «Луна»',
          confirmLabel: 'Создать профиль',
        });
        if (name === null) return;
        try {
          const created = await CharactersApi.create(name);
          toast.success(`Профиль «${created.name}» создан и наполнен справочниками`);
          setProfileId(created.id);
          await this.loadProfiles();
          this.reloadActiveScreen();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      })();
    });

    document.addEventListener(PROFILES_CHANGED_EVENT, () => {
      void this.loadProfiles().then(() => {
        // Выбранный профиль мог быть удалён — loadProfiles уже сбросил выбор.
        this.reloadActiveScreen();
      });
    });

    void this.loadProfiles();
  }

  private async loadProfiles(): Promise<void> {
    const picker = document.getElementById('profilePicker');
    const select = document.getElementById('profileSelect');
    if (picker === null || !(select instanceof HTMLSelectElement)) return;

    try {
      const profiles = await CharactersApi.list();
      const selected = getProfileId();
      const known = profiles.some((p) => p.id === selected);
      if (!known) setProfileId(null);

      const current = getProfileId() ?? profiles[0]?.id ?? null;
      select.innerHTML = profiles
        .map(
          (p) =>
            `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
        )
        .join('');
      picker.hidden = profiles.length === 0;
    } catch {
      // Ключ не введён или бэкенд без мультипрофиля — работаем без селектора.
      picker.hidden = true;
    }
  }

  /**
   * «Обучение» и «Как это работает?» видны только с введённым ключом (требование
   * пользователя 2026-07-31). Это UX, а не защита: данные и так закрыты сервером.
   * Убрали ключ при идущем курсе — курс прерывается (прогресс сохраняется).
   */
  private updateHelpButtons(): void {
    const visible = hasAdminKey();
    for (const id of ['tutorialBtn', 'howItWorks']) {
      const el = document.getElementById(id);
      if (el !== null) el.hidden = !visible;
    }
    if (!visible && tutorialStatus().active) toggleTutorial();
  }

  /** Кнопка «Обучение»: текст отражает состояние курса, событие шлёт движок. */
  private setupTutorial(): void {
    const button = document.getElementById('tutorialBtn');
    if (!(button instanceof HTMLButtonElement)) return;

    const refresh = (): void => {
      const status = tutorialStatus();
      button.classList.toggle('tutorial-running', status.active);
      button.textContent = status.active
        ? 'Прервать обучение'
        : status.savedStep !== null && status.savedStep > 0
          ? `Продолжить обучение (${status.savedStep + 1}/${status.total})`
          : 'Обучение';
    };

    button.addEventListener('click', () => {
      toggleTutorial();
    });
    document.addEventListener(TUTORIAL_STATE_EVENT, refresh);
    refresh();
  }

  /** Гид в шапке и переходы на вкладку событием — компоненты не импортируют оболочку. */
  private setupHelp(): void {
    document.getElementById('howItWorks')?.addEventListener('click', () => {
      openGuide();
    });
    document.addEventListener(GOTO_TAB_EVENT, (event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (typeof detail === 'string' && isTabName(detail)) void this.activateTab(detail);
    });
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
      this.updateHelpButtons();
      // С новым ключом список профилей мог стать доступен (или наоборот).
      void this.loadProfiles();
      // Переоткрываем текущий экран: с новым ключом данные надо перечитать.
      this.reloadActiveScreen();
    });
  }

  private async activateTab(name: TabName): Promise<void> {
    if (this.activeTab === name) return;

    // Сначала гасим прошлую вкладку — иначе её поллинг продолжит жить в фоне.
    if (this.activeTab !== null) {
      this.components.get(this.activeTab)?.deactivate?.();
    }
    // Якорь тултипа остаётся в уходящем экране — сам тултип не должен.
    hideTooltip();

    this.activeTab = name;
    localStorage.setItem(LAST_TAB_KEY, name);
    // Курс «Обучение» следит за текущей вкладкой по этому событию, а не опросом DOM.
    document.dispatchEvent(new CustomEvent<TabName>(TAB_CHANGED_EVENT, { detail: name }));

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
