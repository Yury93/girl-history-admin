import { escapeHtml, onClick, requireElement } from './dom.js';
import { errorText } from '../api/http.js';
import type { TabComponent, TabName } from '../types/tab.js';
import { SCREEN_HELP, type GlossaryKey } from '../help/help-texts.js';

/**
 * Общий каркас экрана: загрузка → отрисовка → показ ошибки.
 *
 * Без него каждый из двенадцати экранов повторял бы один и тот же try/catch со спиннером
 * и текстом ошибки — двенадцать шансов написать его по-разному.
 */
export abstract class BaseScreen implements TabComponent {
  protected readonly root: HTMLElement;
  private loaded = false;

  constructor(containerId: string) {
    this.root = requireElement(containerId);

    // Панель «Что это за экран»: раскрытие классом на живом узле, НЕ через render() —
    // полная перерисовка пересоздала бы узел, и транзишн не сыграл бы. Состояние тут же
    // уходит в localStorage, чтобы следующий render() отрисовал панель как есть.
    onClick(this.root, '.help-toggle', () => {
      const panel = this.root.querySelector<HTMLElement>('[data-help-panel]');
      if (panel === null) return;
      const open = panel.classList.toggle('open');
      localStorage.setItem(
        HELP_STATE_PREFIX + (panel.dataset.helpPanel ?? ''),
        open ? 'open' : 'closed'
      );
    });
  }

  /** Загрузка данных экрана. Вызывается при первом открытии и при явном обновлении. */
  protected abstract load(): Promise<void>;

  /** Отрисовка по уже загруженным данным. */
  protected abstract render(): void;

  async activate(): Promise<void> {
    if (this.loaded) {
      this.render();
      return;
    }
    await this.reload();
  }

  /** Перечитать данные с сервера и перерисовать. */
  async reload(): Promise<void> {
    this.root.innerHTML = '<div class="loading">Загрузка…</div>';
    try {
      await this.load();
      this.loaded = true;
      this.render();
    } catch (e: unknown) {
      this.root.innerHTML = `<div class="empty error-box">${escapeHtml(errorText(e))}</div>`;
    }
  }

  /** Сбросить кеш: следующее открытие перечитает данные. */
  protected invalidate(): void {
    this.loaded = false;
  }
}

const HELP_STATE_PREFIX = 'nova-admin:help:';

/** Панель раскрыта, пока оператор её не закрыл: отсутствие записи — первый визит. */
function helpPanelOpen(tab: TabName): boolean {
  return localStorage.getItem(HELP_STATE_PREFIX + tab) !== 'closed';
}

function helpPanel(tab: TabName): string {
  const help = SCREEN_HELP[tab];
  const list = (items: string[]): string =>
    items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `
    <div class="help-panel ${helpPanelOpen(tab) ? 'open' : ''}" data-help-panel="${tab}">
      <div class="help-panel-clip">
        <div class="help-panel-body">
          <p>${escapeHtml(help.what)}</p>
          <p><b>Когда сюда заходить.</b> ${escapeHtml(help.when)}</p>
          ${help.links.length === 0 ? '' : `<b>Как связано с остальным</b><ul>${list(help.links)}</ul>`}
          ${help.pitfalls.length === 0 ? '' : `<b>Грабли</b><ul>${list(help.pitfalls)}</ul>`}
        </div>
      </div>
    </div>`;
}

/**
 * Точечная подсказка у термина. Показ — общий тултип (`ui/tooltip.ts`); ключ
 * типизирован глоссарием, так что несуществующая подсказка не соберётся.
 */
export function helpMark(key: GlossaryKey): string {
  return `<span class="help-mark" tabindex="0" data-help="${key}" aria-label="Что это значит">?</span>`;
}

/**
 * Заголовок экрана с кнопками справа. `helpKey` добавляет кнопку «?» и панель
 * «Что это за экран» — поведение у всех экранов одинаковое, компонент лишь передаёт ключ.
 */
export function screenHead(
  title: string,
  subtitle: string,
  actions = '',
  helpKey?: TabName
): string {
  const toggle =
    helpKey === undefined
      ? ''
      : `<button type="button" class="help-toggle" aria-label="Что это за экран"
           title="Что это за экран">?</button>`;
  return `
    <div class="screen-head">
      <div>
        <h2>${escapeHtml(title)}${toggle}</h2>
        <p class="hint">${subtitle}</p>
      </div>
      <div class="screen-actions">${actions}</div>
    </div>${helpKey === undefined ? '' : helpPanel(helpKey)}`;
}

export function card(title: string, body: string, extraClass = '', helpKey?: GlossaryKey): string {
  return `
    <section class="card ${extraClass}">
      <h3>${escapeHtml(title)}${helpKey === undefined ? '' : helpMark(helpKey)}</h3>
      ${body}
    </section>`;
}

export function emptyBox(text: string): string {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

/** Таблица со строками, уже собранными в HTML. */
export function table(headers: string[], rows: string[]): string {
  if (rows.length === 0) return emptyBox('Пусто');
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  return `<div class="table-wrap"><table>
      <thead><tr>${head}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>`;
}

export function field(label: string, input: string, hint = ''): string {
  const hintHtml = hint === '' ? '' : `<span class="field-hint">${escapeHtml(hint)}</span>`;
  return `<div class="field"><label>${escapeHtml(label)}</label>${input}${hintHtml}</div>`;
}

export function textInput(name: string, value: string, placeholder = ''): string {
  return `<input type="text" data-name="${escapeHtml(name)}" value="${escapeHtml(value)}"
            placeholder="${escapeHtml(placeholder)}" />`;
}

export function numberInput(name: string, value: number | null): string {
  return `<input type="number" data-name="${escapeHtml(name)}" value="${value ?? ''}" />`;
}

export function dateInput(name: string, value: string): string {
  return `<input type="date" data-name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;
}

export function textArea(name: string, value: string, rows = 3): string {
  return `<textarea data-name="${escapeHtml(name)}" rows="${rows}">${escapeHtml(value)}</textarea>`;
}

export function checkbox(name: string, checked: boolean, label: string): string {
  return `<label class="checkbox"><input type="checkbox" data-name="${escapeHtml(name)}"
            ${checked ? 'checked' : ''} /> ${escapeHtml(label)}</label>`;
}

export function select(
  name: string,
  value: string,
  options: { value: string; label: string }[]
): string {
  const opts = options
    .map(
      (o) =>
        `<option value="${escapeHtml(o.value)}" ${o.value === value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
    )
    .join('');
  return `<select data-name="${escapeHtml(name)}">${opts}</select>`;
}

/** Редактор произвольного json-поля. Красивая печать — иначе править невозможно. */
export function jsonArea(name: string, value: unknown, rows = 8): string {
  const text = JSON.stringify(value ?? null, null, 2);
  return `<textarea class="mono" data-name="${escapeHtml(name)}" rows="${rows}">${escapeHtml(text)}</textarea>`;
}

/** Разбор json-поля с внятной ошибкой вместо молчаливого падения. */
export function readJson(root: ParentNode, name: string): unknown {
  const el = root.querySelector<HTMLTextAreaElement>(`[data-name="${name}"]`);
  if (el === null) return null;
  try {
    return JSON.parse(el.value === '' ? 'null' : el.value);
  } catch {
    throw new Error(`Поле «${name}» — не валидный JSON`);
  }
}

export function readValue(root: ParentNode, name: string): string {
  const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    `[data-name="${name}"]`
  );
  return el?.value.trim() ?? '';
}

export function readNumber(root: ParentNode, name: string): number | null {
  const raw = readValue(root, name);
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readChecked(root: ParentNode, name: string): boolean {
  const el = root.querySelector<HTMLInputElement>(`[data-name="${name}"]`);
  return el?.checked ?? false;
}

/** Список строк из textarea: по строке на элемент, пустые отбрасываются. */
export function readLines(root: ParentNode, name: string): string[] {
  return readValue(root, name)
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export function linesArea(name: string, values: string[], rows = 5): string {
  return `<textarea data-name="${escapeHtml(name)}" rows="${rows}">${escapeHtml(values.join('\n'))}</textarea>`;
}

export function badge(text: string, kind = ''): string {
  return `<span class="badge ${kind}">${escapeHtml(text)}</span>`;
}

/** Строка «ключ: значение» для компактных карточек. */
export function kv(label: string, value: string): string {
  return `<div class="kv"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}
