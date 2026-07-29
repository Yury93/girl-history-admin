import { ChronicleApi } from '../../api/chronicle-api.js';
import { errorText } from '../../api/http.js';
import { store } from '../../state/app-state.js';
import { escapeHtml, onClick, query, requireElement, withBusy } from '../../ui/dom.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { formatDate, formatDateTime, pluralWithCount, toDateInputValue } from '../../ui/format.js';
import {
  CHRONICLES_PER_PERSONA_MAX,
  PERIOD_MAX,
  PERIOD_MIN,
  PERIOD_PRESETS,
  PROMPT_EXTRA_MAX,
} from '../../types/limits.js';
import { LLM_PROVIDERS, type LlmProvider } from '../../types/job.js';
import { GenerationProgress, type ProgressView } from './generation-progress.js';
import type { ChronicleSummary } from '../../types/chronicle.js';
import type { TabComponent } from '../../types/tab.js';

/** Событие смены вкладки — чтобы компонент не знал про оболочку. */
export const OPEN_TAB_EVENT = 'gh:open-tab';

/** Вкладка «Хроники»: список, запуск генерации, прогресс, публичные ссылки. */
export class ChroniclesComponent implements TabComponent {
  private readonly container: HTMLElement;
  private readonly progress = new GenerationProgress();
  private lastView: ProgressView | null = null;

  constructor(containerId: string) {
    this.container = requireElement(containerId);
    store.subscribe(() => {
      if (this.container.classList.contains('active')) this.render();
    });
  }

  activate(): Promise<void> {
    this.render();
    this.syncPolling();
    return Promise.resolve();
  }

  /** Уход с вкладки: таймер обязан умереть, иначе они копятся при переключениях. */
  deactivate(): void {
    this.progress.stop();
    this.lastView = null;
  }

  private render(): void {
    const persona = store.persona;
    if (persona === null) {
      this.container.innerHTML = `
        <div class="empty">
          <div class="icon">👈</div>
          <div class="title">Профиль не выбран</div>
          <div class="desc">Хроники принадлежат профилю персонажа — сначала выберите его.</div>
        </div>`;
      return;
    }

    const chronicles = persona.chronicles;
    const usableRefs = persona.images.filter(
      (img) => img.description !== null && img.description.trim() !== ''
    ).length;
    const busy = store.hasActiveGeneration;
    const atLimit = chronicles.length >= CHRONICLES_PER_PERSONA_MAX;

    const sourceNote =
      usableRefs === 0
        ? 'Генерация пойдёт <b>только по промпту</b> — учитываемых референсов нет.'
        : `Генерация пойдёт по промпту <b>и ${pluralWithCount(usableRefs, 'фото', 'фото', 'фото')}</b> с описанием.`;

    this.container.innerHTML = `
      <div class="panel-head">
        <h2>Хроники</h2>
        <span class="badge badge-neutral">${chronicles.length} / ${CHRONICLES_PER_PERSONA_MAX}</span>
        <div class="spacer"></div>
        <button class="btn-primary" id="btnNewChronicle" ${busy || atLimit ? 'disabled' : ''}>
          Новая хроника
        </button>
      </div>

      <div class="panel-sub">
        ${sourceNote}
        ${atLimit ? '<br><b>Достигнут предел ' + String(CHRONICLES_PER_PERSONA_MAX) + ' хроник на профиль — удалите ненужные.</b>' : ''}
        ${
          busy
            ? '<br>Идёт генерация. Пока она не закончится, запустить вторую нельзя — ' +
              'бэкенд разрешает одну на профиль, и правка дней тоже заблокирована.'
            : ''
        }
      </div>

      <div id="progressBox"></div>
      <div id="chroniclesList">${this.renderList(chronicles)}</div>`;

    this.bind();
    this.renderProgress();
  }

  private renderList(chronicles: ChronicleSummary[]): string {
    if (chronicles.length === 0) {
      return `
        <div class="empty">
          <div class="icon">📖</div>
          <div class="title">Хроник пока нет</div>
          <div class="desc">Хроника — это лента «что она делала каждый день» за выбранный срок.
            Нажмите «Новая хроника» и укажите период.</div>
        </div>`;
    }

    return chronicles
      .map((c) => {
        const badge = statusBadge(c.status);
        const stale = c.stale
          ? `<span class="badge badge-partial" title="Промпт профиля правили после генерации">
               промпт изменился
             </span>`
          : '';
        const active = c.status === 'pending' || c.status === 'running';

        return `
          <div class="card" data-chronicle-id="${c.id}" data-public-token="${escapeHtml(c.publicToken)}">
            <div class="row wrap" style="margin-bottom:10px;">
              <strong style="font-size:15px;">
                ${pluralWithCount(c.periodDays, 'день', 'дня', 'дней')}
              </strong>
              ${badge}
              ${stale}
              <div class="spacer"></div>
              <button class="btn-secondary btn-sm" data-action="open" ${active ? 'disabled' : ''}>
                Открыть ленту
              </button>
              <button class="btn-secondary btn-sm" data-action="copy-link">Ссылка</button>
              <button class="btn-danger btn-sm" data-action="delete" ${active ? 'disabled' : ''}>
                Удалить
              </button>
            </div>
            <div class="dim" style="font-size:12px;">
              С ${escapeHtml(formatDate(c.startDate))} · создана ${escapeHtml(formatDateTime(c.createdAt))}
              ${c.stale ? '<br>Промпт профиля правили после генерации — лента может ему противоречить. Перегенерировать можно на вкладке «Лента».' : ''}
            </div>
          </div>`;
      })
      .join('');
  }

  private bind(): void {
    const root = this.container;

    query<HTMLButtonElement>(root, '#btnNewChronicle')?.addEventListener('click', () => {
      this.openCreateForm();
    });

    onClick(root, '[data-action]', (el) => {
      const card = el.closest<HTMLElement>('[data-chronicle-id]');
      if (card === null) return;
      const id = Number(card.dataset.chronicleId);
      const token = card.dataset.publicToken ?? '';

      switch (el.dataset.action) {
        case 'open':
          store.selectChronicle(token);
          document.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: 'days' }));
          break;
        case 'copy-link':
          void this.copyPublicLink(token);
          break;
        case 'delete':
          if (Number.isInteger(id)) void this.remove(id);
          break;
        default:
          break;
      }
    });
  }

  /**
   * Ссылка для чтения строится на publicToken — не путать с ключом правки профиля.
   *
   * Пока это адрес API: он отдаёт хронику в JSON, промпт наружу не попадает. Человеческой
   * страницы для гостя ещё нет (решение от 2026-07-29 — экран за рамками админки), поэтому
   * честно предупреждаем, а не выдаём ссылку за готовую витрину.
   */
  private async copyPublicLink(publicToken: string): Promise<void> {
    const link = `${window.location.origin}/girl-history/chronicles/${publicToken}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.info(
        'Ссылка скопирована. Сейчас это адрес API — отдаёт хронику в JSON, только чтение.'
      );
    } catch {
      toast.warn(`Скопируйте вручную: ${link}`);
    }
  }

  /** Следим за активной хроникой; если активной нет — таймер не нужен. */
  private syncPolling(): void {
    const active = (store.persona?.chronicles ?? []).find(
      (c) => c.status === 'pending' || c.status === 'running'
    );

    if (active === undefined) {
      this.progress.stop();
      return;
    }
    if (this.progress.watching === active.publicToken) return;

    this.progress.start(
      active.publicToken,
      active.periodDays,
      (view) => {
        this.lastView = view;
        this.renderProgress();
      },
      (view) => {
        this.lastView = view;
        // Статусы в списке протухли — перечитываем профиль целиком.
        void store.reload().catch(() => undefined);
        if (view.status.status === 'done') toast.success('Генерация завершена.');
        else if (view.status.status === 'partial') toast.warn(view.label);
        else toast.error(view.label);
      }
    );
  }

  private renderProgress(): void {
    const box = query<HTMLElement>(this.container, '#progressBox');
    if (box === null) return;

    const view = this.lastView;
    if (view === null || !this.progress.isRunning) {
      box.innerHTML = '';
      return;
    }

    // percent === null — честно показываем неопределённый индикатор вместо выдуманной цифры.
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

  private async remove(chronicleId: number): Promise<void> {
    const persona = store.persona;
    if (persona === null) return;

    const confirmed = await confirmDialog({
      title: 'Удалить хронику?',
      message:
        'Лента и все её дни будут удалены, публичная ссылка перестанет работать. ' +
        'Профиль персонажа останется.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await ChronicleApi.remove(persona.ownerToken, chronicleId);
      await store.reload();
      toast.success('Хроника удалена.');
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  private openCreateForm(): void {
    const persona = store.persona;
    const root = document.getElementById('modal-root');
    if (persona === null || root === null) return;

    const usableRefs = persona.images.filter(
      (img) => img.description !== null && img.description.trim() !== ''
    ).length;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="max-width: 560px;">
        <h3>Новая хроника</h3>
        <p>${
          usableRefs === 0
            ? 'Будет построена <b>только по промпту</b> — учитываемых референсов у профиля нет.'
            : `Будет построена по промпту и <b>${pluralWithCount(usableRefs, 'фото', 'фото', 'фото')}</b> с описанием.`
        }</p>

        <div class="field">
          <label>Период</label>
          <div class="row" id="presets" style="margin-bottom:8px;">
            ${PERIOD_PRESETS.map(
              (days) =>
                `<button class="btn-secondary btn-sm" data-preset="${days}">${days} дн.</button>`
            ).join('')}
          </div>
          <input type="number" id="fPeriod" min="${PERIOD_MIN}" max="${PERIOD_MAX}" value="7" />
          <div class="hint">Целое число от ${PERIOD_MIN} до ${PERIOD_MAX}.
            Чем длиннее период, тем дольше и дороже генерация.</div>
        </div>

        <div class="field">
          <label>Начало периода — необязательно</label>
          <input type="date" id="fStart" max="${toDateInputValue(new Date())}" />
          <div class="hint">Пусто — «последние N дней по сегодня». Дата фиксируется при создании
            и потом не сдвигается.</div>
        </div>

        <div class="field">
          <label>Пожелание к этой хронике — необязательно
            <span class="counter" id="extraCounter"></span></label>
          <textarea id="fExtra" rows="3"
            placeholder="Например: этот месяц она готовится к переезду."></textarea>
          <div class="hint">Разовое уточнение поверх промпта профиля. Промпт не меняет.</div>
        </div>

        <div class="field">
          <label>Провайдер</label>
          <select id="fProvider">
            ${LLM_PROVIDERS.map(
              (p) => `<option value="${p}">${p === 'claude' ? 'Claude' : 'DeepSeek'}</option>`
            ).join('')}
          </select>
          <div class="hint">Фиксируется у этой хроники — одного персонажа можно прогнать обоими
            и сравнить.</div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="genCancel">Отмена</button>
          <button class="btn-primary" id="genOk">Сгенерировать</button>
        </div>
      </div>`;

    const periodInput = backdrop.querySelector<HTMLInputElement>('#fPeriod');
    const startInput = backdrop.querySelector<HTMLInputElement>('#fStart');
    const extraInput = backdrop.querySelector<HTMLTextAreaElement>('#fExtra');
    const providerInput = backdrop.querySelector<HTMLSelectElement>('#fProvider');
    const okBtn = backdrop.querySelector<HTMLButtonElement>('#genOk');
    const extraCounter = backdrop.querySelector<HTMLElement>('#extraCounter');

    const close = (): void => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };

    const refresh = (): void => {
      const period = Number(periodInput?.value ?? '');
      const extraLength = extraInput?.value.trim().length ?? 0;
      if (extraCounter !== null) {
        extraCounter.textContent = `${extraLength} / ${PROMPT_EXTRA_MAX}`;
        extraCounter.classList.toggle('over', extraLength > PROMPT_EXTRA_MAX);
      }
      if (okBtn !== null) {
        okBtn.disabled =
          !Number.isInteger(period) ||
          period < PERIOD_MIN ||
          period > PERIOD_MAX ||
          extraLength > PROMPT_EXTRA_MAX;
      }
    };

    periodInput?.addEventListener('input', refresh);
    extraInput?.addEventListener('input', refresh);
    backdrop.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (periodInput !== null) periodInput.value = btn.dataset.preset ?? '7';
        refresh();
      });
    });
    refresh();

    backdrop.querySelector('#genCancel')?.addEventListener('click', close);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);

    okBtn?.addEventListener('click', () => {
      void withBusy(okBtn, async () => {
        const extra = extraInput?.value.trim() ?? '';
        const start = startInput?.value ?? '';
        const provider = providerInput?.value;

        try {
          await ChronicleApi.create(persona.ownerToken, {
            periodDays: Number(periodInput?.value ?? '7'),
            // Формат YYYY-MM-DD, как отдаёт input[type=date]. НЕ ISO с временем.
            ...(start === '' ? {} : { startDate: start }),
            ...(extra === '' ? {} : { promptExtra: extra }),
            ...(isProvider(provider) ? { provider } : {}),
          });
          close();
          await store.reload();
          this.syncPolling();
          toast.info('Генерация запущена. Прогресс — на этой вкладке.');
        } catch (error) {
          toast.error(errorText(error));
        }
      });
    });

    root.appendChild(backdrop);
    periodInput?.focus();
  }
}

function isProvider(value: string | undefined): value is LlmProvider {
  return value !== undefined && (LLM_PROVIDERS as readonly string[]).includes(value);
}

function statusBadge(status: ChronicleSummary['status']): string {
  switch (status) {
    case 'done':
      return '<span class="badge badge-done">готова</span>';
    case 'running':
      return '<span class="badge badge-running">генерируется</span>';
    case 'pending':
      return '<span class="badge badge-running">в очереди</span>';
    case 'partial':
      // Не провал: часть дней на месте, повтор дозаполнит.
      return '<span class="badge badge-partial">частично</span>';
    case 'failed':
      return '<span class="badge badge-failed">не удалась</span>';
    default:
      return '';
  }
}
