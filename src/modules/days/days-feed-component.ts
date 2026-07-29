import { ChronicleApi } from '../../api/chronicle-api.js';
import { ChroniclePublicApi } from '../../api/chronicle-public-api.js';
import { errorText } from '../../api/http.js';
import { store } from '../../state/app-state.js';
import { escapeHtml, onClick, query, queryAll, requireElement } from '../../ui/dom.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { pluralWithCount } from '../../ui/format.js';
import { isJobActive } from '../../types/job.js';
import { REGENERATE_DAYS_MAX } from '../../types/limits.js';
import { GenerationProgress, type ProgressView } from '../chronicles/generation-progress.js';
import { mountDayEditor } from './day-editor.js';
import type { ChroniclePublic, StoryLine } from '../../types/chronicle.js';
import type { Day } from '../../types/day.js';
import type { TabComponent } from '../../types/tab.js';

/**
 * Вкладка «Лента»: дни хроники, правка и выборочная регенерация.
 *
 * Читаем через ПУБЛИЧНЫЙ эндпоинт по publicToken — у владельца своего GET для дней нет
 * (в OwnerChronicleController нет ни одного @GET). Пишем через владельческие маршруты.
 */
export class DaysFeedComponent implements TabComponent {
  private readonly container: HTMLElement;
  private readonly progress = new GenerationProgress();
  private chronicle: ChroniclePublic | null = null;
  private selected = new Set<number>();
  private editing: number | null = null;
  private overwriteEdited = false;
  private from: number | null = null;
  private to: number | null = null;
  private lastView: ProgressView | null = null;
  private loading = false;

  constructor(containerId: string) {
    this.container = requireElement(containerId);
    store.subscribe(() => {
      if (!this.container.classList.contains('active')) return;
      // Сменилась хроника — перечитываем; иначе просто перерисовываем шапку.
      if (this.chronicle?.publicToken !== store.selectedChronicleToken) void this.load();
    });
  }

  async activate(): Promise<void> {
    await this.load();
  }

  deactivate(): void {
    this.progress.stop();
    this.lastView = null;
  }

  private async load(): Promise<void> {
    const token = store.selectedChronicleToken;
    if (token === null) {
      this.chronicle = null;
      this.render();
      return;
    }

    this.loading = true;
    this.render();
    try {
      this.chronicle = await ChroniclePublicApi.get(token);
      this.selected.clear();
      this.editing = null;
    } catch (error) {
      this.chronicle = null;
      toast.error(errorText(error));
    } finally {
      this.loading = false;
      this.render();
      this.syncPolling();
    }
  }

  /** Дни, попавшие в фильтр диапазона. */
  private visibleDays(): Day[] {
    const days = this.chronicle?.days ?? [];
    // Фильтруем на клиенте: вся хроника (максимум 90 дней) уже загружена одним запросом,
    // и второй поход на /days?from=&to= был бы лишним.
    return days.filter((day) => {
      if (this.from !== null && day.dayIndex < this.from) return false;
      if (this.to !== null && day.dayIndex > this.to) return false;
      return true;
    });
  }

  /** Группировка по сюжетным линиям. Дни вне линий (короткий период) идут одной группой. */
  private groups(): { line: StoryLine | null; days: Day[] }[] {
    const chronicle = this.chronicle;
    const days = this.visibleDays();
    if (chronicle === null || chronicle.lines.length === 0) {
      return days.length === 0 ? [] : [{ line: null, days }];
    }

    const result: { line: StoryLine | null; days: Day[] }[] = [];
    const claimed = new Set<number>();

    for (const line of chronicle.lines) {
      const inLine = days.filter((d) => d.dayIndex >= line.startDay && d.dayIndex <= line.endDay);
      inLine.forEach((d) => claimed.add(d.dayIndex));
      if (inLine.length > 0) result.push({ line, days: inLine });
    }

    const orphans = days.filter((d) => !claimed.has(d.dayIndex));
    if (orphans.length > 0) result.push({ line: null, days: orphans });
    return result;
  }

  private render(): void {
    // Пока открыт редактор дня, ленту не перерисовываем: innerHTML снёс бы форму вместе
    // с набранным, но не сохранённым текстом. Редактор сам зовёт render() после выхода.
    if (this.editing !== null) return;

    if (store.persona === null) {
      this.container.innerHTML = `
        <div class="empty">
          <div class="icon">👈</div>
          <div class="title">Профиль не выбран</div>
          <div class="desc">Выберите профиль, затем откройте одну из его хроник.</div>
        </div>`;
      return;
    }

    if (store.selectedChronicleToken === null) {
      this.container.innerHTML = `
        <div class="empty">
          <div class="icon">📖</div>
          <div class="title">Хроника не выбрана</div>
          <div class="desc">Перейдите на вкладку «Хроники» и нажмите «Открыть ленту»
            у нужной записи.</div>
        </div>`;
      return;
    }

    if (this.loading && this.chronicle === null) {
      this.container.innerHTML = '<div class="empty"><div class="desc">Загрузка ленты…</div></div>';
      return;
    }

    const chronicle = this.chronicle;
    if (chronicle === null) {
      this.container.innerHTML = `
        <div class="empty">
          <div class="icon">⚠️</div>
          <div class="title">Не удалось загрузить</div>
          <div class="desc">Попробуйте обновить или выберите другую хронику.</div>
        </div>`;
      return;
    }

    const busy = isJobActive(chronicle.status.status);
    const groups = this.groups();
    const total = chronicle.days.length;

    this.container.innerHTML = `
      <div class="panel-head">
        <h2>Лента</h2>
        <span class="badge badge-neutral">
          ${pluralWithCount(chronicle.periodDays, 'день', 'дня', 'дней')}, написано ${total}
        </span>
        <div class="spacer"></div>
        <button class="btn-secondary" data-action="reload">Обновить</button>
      </div>

      <div class="panel-sub">
        ${escapeHtml(chronicle.persona.name)} · провайдер ${escapeHtml(chronicle.llmProvider)}
        ${busy ? '<br><b>Идёт генерация — правка дней и регенерация сейчас недоступны.</b>' : ''}
      </div>

      <div id="feedProgress"></div>

      <div class="card">
        <div class="row wrap">
          <div class="row" style="gap:6px;">
            <label class="dim" style="font-size:12px;">Дни с</label>
            <input type="number" id="fFrom" min="0" max="${chronicle.periodDays - 1}"
                   style="width:80px;" value="${this.from ?? ''}" />
            <label class="dim" style="font-size:12px;">по</label>
            <input type="number" id="fTo" min="0" max="${chronicle.periodDays - 1}"
                   style="width:80px;" value="${this.to ?? ''}" />
            <button class="btn-secondary btn-sm" data-action="filter">Показать</button>
            <button class="btn-ghost btn-sm" data-action="filter-reset">Сбросить</button>
          </div>
          <div class="spacer"></div>
          <button class="btn-ghost btn-sm" data-action="select-all">Выбрать все</button>
          <button class="btn-ghost btn-sm" data-action="select-none">Снять</button>
        </div>

        <div class="divider" style="margin:14px 0;"></div>

        <div class="row wrap">
          <label class="row" style="gap:6px;font-size:12px;cursor:pointer;">
            <input type="checkbox" id="fOverwrite" style="width:auto;"
                   ${this.overwriteEdited ? 'checked' : ''} />
            Перезаписывать дни, правленые вручную
          </label>
          <div class="spacer"></div>
          <span class="dim" style="font-size:12px;">
            выбрано ${this.selected.size}
          </span>
          <button class="btn-primary btn-sm" data-action="regenerate"
                  ${busy || this.selected.size === 0 ? 'disabled' : ''}>
            Перегенерировать выбранные
          </button>
        </div>
        <div class="hint">
          По умолчанию правленые вручную дни регенерация пропускает — иначе первый же повтор
          затёр бы вашу работу. Учтите: если перегенерировать день из середины, следующие дни
          перестанут из него следовать.
        </div>
      </div>

      ${
        groups.length === 0
          ? `<div class="empty">
               <div class="icon">🕓</div>
               <div class="title">${total === 0 ? 'Дни ещё не написаны' : 'В этот диапазон ничего не попало'}</div>
               <div class="desc">${
                 total === 0
                   ? 'Если генерация завершилась с ошибкой, запустите её повторно на вкладке «Хроники».'
                   : 'Измените диапазон или сбросьте фильтр.'
               }</div>
             </div>`
          : groups.map((group) => this.renderGroup(group.line, group.days, busy)).join('')
      }`;

    this.bind();
    this.renderProgress();
  }

  private renderGroup(line: StoryLine | null, days: Day[], busy: boolean): string {
    const header =
      line === null
        ? ''
        : `<div class="panel-head" style="margin:22px 0 10px;">
             <h2 style="font-size:15px;">${escapeHtml(line.title)}</h2>
             <span class="dim" style="font-size:12px;">дни ${line.startDay}–${line.endDay}</span>
           </div>
           <div class="dim" style="font-size:12px;margin:-6px 0 12px;">
             Чем заканчивается: ${escapeHtml(line.ending)}
           </div>`;

    return header + days.map((day) => this.renderDay(day, busy)).join('');
  }

  private renderDay(day: Day, busy: boolean): string {
    const checked = this.selected.has(day.dayIndex) ? 'checked' : '';
    const editedBadge = day.isEdited
      ? '<span class="badge badge-partial">правлено вручную</span>'
      : '';
    const tags = day.activityTags
      .map((tag) => `<span class="topic-chip badge badge-neutral">${escapeHtml(tag)}</span>`)
      .join(' ');

    return `
      <div class="card" data-day="${day.dayIndex}">
        <div class="row wrap" style="margin-bottom:8px;">
          <input type="checkbox" data-role="pick" style="width:auto;" ${checked} />
          <strong>${escapeHtml(day.date)}</strong>
          <span class="dim">${escapeHtml(day.weekday)}</span>
          ${editedBadge}
          <div class="spacer"></div>
          ${day.mood === null ? '' : `<span class="dim">${escapeHtml(day.mood)}</span>`}
          <button class="btn-ghost btn-sm" data-action="edit" ${busy ? 'disabled' : ''}>Править</button>
          <button class="btn-ghost btn-sm" data-action="regen-from" ${busy ? 'disabled' : ''}
                  title="Перегенерировать этот день и все следующие">С этого и далее</button>
        </div>
        <div style="font-weight:600;margin-bottom:6px;">${escapeHtml(day.title)}</div>
        <div style="line-height:1.65;">${escapeHtml(day.text)}</div>
        ${tags === '' ? '' : `<div class="row wrap" style="margin-top:10px;gap:6px;">${tags}</div>`}
      </div>`;
  }

  private bind(): void {
    const root = this.container;

    query<HTMLInputElement>(root, '#fOverwrite')?.addEventListener('change', (event) => {
      this.overwriteEdited = (event.target as HTMLInputElement).checked;
    });

    onClick(root, '[data-action]', (el) => {
      const action = el.dataset.action;
      const card = el.closest<HTMLElement>('[data-day]');
      const dayIndex = card === null ? null : Number(card.dataset.day);

      switch (action) {
        case 'reload':
          void this.load();
          break;
        case 'filter':
          this.applyFilter();
          break;
        case 'filter-reset':
          this.from = null;
          this.to = null;
          this.render();
          break;
        case 'select-all':
          this.visibleDays().forEach((d) => this.selected.add(d.dayIndex));
          this.render();
          break;
        case 'select-none':
          this.selected.clear();
          this.render();
          break;
        case 'regenerate':
          void this.regenerate([...this.selected].sort((a, b) => a - b));
          break;
        case 'edit':
          if (dayIndex !== null && Number.isInteger(dayIndex)) this.startEdit(dayIndex, card);
          break;
        case 'regen-from':
          if (dayIndex !== null && Number.isInteger(dayIndex)) void this.regenerateFrom(dayIndex);
          break;
        default:
          break;
      }
    });

    // Чекбоксы держим в состоянии сами: перерисовка списка иначе сбрасывала бы выбор.
    queryAll<HTMLInputElement>(root, '[data-role="pick"]').forEach((box) => {
      box.addEventListener('change', () => {
        const card = box.closest<HTMLElement>('[data-day]');
        const index = card === null ? NaN : Number(card.dataset.day);
        if (!Number.isInteger(index)) return;
        if (box.checked) this.selected.add(index);
        else this.selected.delete(index);
        // Перерисовываем только счётчик и кнопку, чтобы не терять фокус.
        this.render();
      });
    });
  }

  private applyFilter(): void {
    const fromRaw = query<HTMLInputElement>(this.container, '#fFrom')?.value.trim() ?? '';
    const toRaw = query<HTMLInputElement>(this.container, '#fTo')?.value.trim() ?? '';
    this.from = fromRaw === '' ? null : Number(fromRaw);
    this.to = toRaw === '' ? null : Number(toRaw);
    this.render();
  }

  private startEdit(dayIndex: number, card: HTMLElement | null): void {
    const chronicle = this.chronicle;
    const ownerToken = store.persona?.ownerToken;
    const summary = store.selectedChronicle;
    if (chronicle === null || card === null || ownerToken === undefined || summary === null) return;

    const day = chronicle.days.find((d) => d.dayIndex === dayIndex);
    if (day === undefined) return;

    this.editing = dayIndex;
    mountDayEditor(card, day, ownerToken, summary.id, {
      onSaved: (updated) => {
        // Новый updatedAt кладём в локальную модель: без него следующая правка → 409.
        chronicle.days = chronicle.days.map((d) => (d.dayIndex === updated.dayIndex ? updated : d));
        this.editing = null;
        this.render();
      },
      onCancel: () => {
        this.editing = null;
        this.render();
      },
      onStale: () => {
        this.editing = null;
        void this.load();
      },
    });
  }

  private async regenerateFrom(dayIndex: number): Promise<void> {
    const chronicle = this.chronicle;
    if (chronicle === null) return;
    const indexes = chronicle.days
      .map((d) => d.dayIndex)
      .filter((index) => index >= dayIndex)
      .sort((a, b) => a - b);
    await this.regenerate(indexes);
  }

  private async regenerate(dayIndexes: number[]): Promise<void> {
    const persona = store.persona;
    const summary = store.selectedChronicle;
    if (persona === null || summary === null || dayIndexes.length === 0) return;

    if (dayIndexes.length > REGENERATE_DAYS_MAX) {
      toast.error(`За раз можно перегенерировать не больше ${REGENERATE_DAYS_MAX} дней.`);
      return;
    }

    const editedInScope = (this.chronicle?.days ?? []).filter(
      (d) => dayIndexes.includes(d.dayIndex) && d.isEdited
    ).length;

    const confirmed = await confirmDialog({
      title: 'Перегенерировать выбранные дни?',
      message:
        `Будет переписано ${pluralWithCount(dayIndexes.length, 'день', 'дня', 'дней')}. ` +
        (editedInScope === 0
          ? ''
          : this.overwriteEdited
            ? `Среди них ${editedInScope} правлены вручную — они БУДУТ перезаписаны.`
            : `Среди них ${editedInScope} правлены вручную — они будут пропущены.`) +
        '\nЭто стоит денег и занимает время.',
      confirmLabel: 'Перегенерировать',
      danger: this.overwriteEdited && editedInScope > 0,
    });
    if (!confirmed) return;

    try {
      await ChronicleApi.regenerate(persona.ownerToken, summary.id, {
        dayIndexes,
        overwriteEdited: this.overwriteEdited,
      });
      this.selected.clear();
      await store.reload();
      this.syncPolling();
      toast.info('Регенерация запущена.');
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  private syncPolling(): void {
    const summary = store.selectedChronicle;
    if (summary === null || !isJobActive(summary.status)) {
      this.progress.stop();
      return;
    }
    if (this.progress.watching === summary.publicToken) return;

    this.progress.start(
      summary.publicToken,
      summary.periodDays,
      (view) => {
        this.lastView = view;
        this.renderProgress();
      },
      (view) => {
        this.lastView = view;
        void store.reload().catch(() => undefined);
        void this.load();
        if (view.status.status === 'done') toast.success('Регенерация завершена.');
        else if (view.status.status === 'partial') toast.warn(view.label);
        else toast.error(view.label);
      }
    );
  }

  private renderProgress(): void {
    const box = query<HTMLElement>(this.container, '#feedProgress');
    if (box === null) return;

    const view = this.lastView;
    if (view === null || !this.progress.isRunning) {
      box.innerHTML = '';
      return;
    }

    const bar =
      view.percent === null
        ? '<div class="progress-bar indeterminate"></div>'
        : `<div class="progress-bar" style="width:${view.percent}%"></div>`;

    box.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:8px;">
          <strong>Идёт генерация</strong>
          <div class="spacer"></div>
          <span class="dim">${view.percent === null ? '' : `${view.percent}%`}</span>
        </div>
        <div class="progress">${bar}</div>
        <div class="hint">${escapeHtml(view.label)}</div>
      </div>`;
  }
}
