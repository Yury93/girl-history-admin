import { GenerationApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { formatDateTime, toDateInputValue } from '../../ui/format.js';
import {
  BaseScreen,
  badge,
  card,
  checkbox,
  emptyBox,
  field,
  readChecked,
  readValue,
  screenHead,
  table,
} from '../../ui/screen.js';
import { SLOT_TITLES, type DayPlan, type GenerationRun, type Slot } from '../../types/engine.js';

/** Пока прогон идёт, статус опрашивается с этим интервалом. */
const POLL_MS = 2000;

/**
 * Запуск генерации и разбор результата.
 *
 * Одновременно живёт максимум ОДИН прогон: второй запуск получает 409. Поллинг гасится в
 * `deactivate()` и на терминальном статусе — иначе таймеры копились бы при переключении вкладок.
 */
export class GenerationComponent extends BaseScreen {
  private runs: GenerationRun[] = [];
  private plan: DayPlan | null = null;
  private timer: number | null = null;
  private bound = false;

  protected async load(): Promise<void> {
    this.runs = await GenerationApi.runs(20);
  }

  deactivate(): void {
    this.stopPolling();
  }

  protected render(): void {
    const today = toDateInputValue(new Date());
    const active = this.runs.find((r) => r.status === 'pending' || r.status === 'running') ?? null;

    this.root.innerHTML = `
      ${screenHead(
        'Генерация',
        'Сценарий дня собирается детерминированно; LLM только пишет тексты по готовому плану.',
        ''
      )}
      ${card(
        'Запуск',
        `<div class="grid-2">
           ${field('С даты', `<input type="date" data-name="from" value="${today}" />`)}
           ${field('По дату', `<input type="date" data-name="to" value="${today}" />`)}
         </div>
         <div class="checks">
           ${checkbox('withTexts', true, 'Писать тексты (вызовы LLM, стоит денег)')}
           ${checkbox('withImages', false, 'Генерировать картинки (нужен включённый Higgsfield)')}
           ${checkbox('overwrite', false, 'Перезаписывать дни с ручными правками')}
         </div>
         <p class="hint">Без «перезаписывать» день, где есть хоть один правленый пост,
            пропускается целиком и попадает в отчёт прогона.</p>
         <button class="btn-primary" id="runGen" ${active === null ? '' : 'disabled'}>
           ${active === null ? 'Запустить' : `Идёт прогон #${active.id}`}
         </button>`
      )}
      ${card('Прогоны', this.runsTable())}
      ${card(
        'Что выпало за день',
        `<div class="inline-form">
           <input type="date" data-name="planDate" value="${today}" />
           <button class="btn-secondary" id="loadPlan">Показать</button>
         </div>
         ${this.planView()}`
      )}`;

    this.bind();
    if (active !== null) this.startPolling();
  }

  private runsTable(): string {
    if (this.runs.length === 0) return emptyBox('Прогонов ещё не было');
    return table(
      ['#', 'Период', 'Стадия', 'Статус', 'Готово', 'Отчёт', 'Начат'],
      this.runs.map(
        (r) => `<tr>
          <td>${r.id}</td>
          <td>${escapeHtml(r.dateFrom)}${r.dateFrom === r.dateTo ? '' : ` — ${escapeHtml(r.dateTo)}`}</td>
          <td>${escapeHtml(r.stage)}</td>
          <td>${badge(r.status, statusKind(r.status))}</td>
          <td>${r.doneDays}/${r.totalDays}</td>
          <td class="small">${this.reportText(r)}</td>
          <td class="small">${escapeHtml(formatDateTime(r.startedAt))}</td>
        </tr>`
      )
    );
  }

  private reportText(run: GenerationRun): string {
    if (run.error !== null) return `<span class="warn-text">${escapeHtml(run.error)}</span>`;
    if (run.report.length === 0) return '—';
    return run.report
      .map((e) =>
        escapeHtml(`${e.date}: ${e.reason}${e.detail === undefined ? '' : ` (${e.detail})`}`)
      )
      .join('<br>');
  }

  private planView(): string {
    const plan = this.plan;
    if (plan === null) return emptyBox('Выберите дату и нажмите «Показать»');

    const slots = plan.slots
      .map(
        (s) => `<tr>
          <td>${escapeHtml(SLOT_TITLES[s.slot as Slot] ?? s.slot)}</td>
          <td>${escapeHtml(s.anchor)}</td>
          <td><code>${escapeHtml(s.locationKey)}</code></td>
          <td>${escapeHtml(s.wardrobeLookKey ?? '—')} / ${escapeHtml(s.hair ?? '—')}</td>
          <td class="small">${s.variants
            .map((v) => `${escapeHtml(v.poolKey)}: ${escapeHtml(v.text)}`)
            .join('<br>')}</td>
          <td class="small">${s.exhaustedPools.map((p) => badge(p, 'error')).join(' ')}
              ${s.skippedPools.map((p) => badge(p)).join(' ')}</td>
        </tr>`
      )
      .join('');

    return `
      <div class="plan-head">
        ${badge(plan.modeKey)} ${badge(plan.weekday)}
        ${plan.arcWeek === null ? '' : badge(`арка нед. ${plan.arcWeek}`, 'ok')}
        ${plan.deviationKeys.map((k) => badge(k, 'warn')).join(' ')}
        ${plan.questKey === null ? '' : badge(`квест ${plan.questKey}`, 'ok')}
        ${plan.constantKey === null ? '' : badge(plan.constantKey)}
      </div>
      ${
        plan.arcEpisode === null
          ? ''
          : `<p class="hint">Эпизод недели: <b>${escapeHtml(plan.arcEpisode.title)}</b> — ${escapeHtml(plan.arcEpisode.goal)}</p>`
      }
      ${table(
        ['Слот', 'Якорь', 'Локация', 'Лук / причёска', 'Варианты', 'Пулы'],
        slots === '' ? [] : [slots]
      )}`;
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '#runGen', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        const from = readValue(this.root, 'from');
        const to = readValue(this.root, 'to');
        const payload = {
          withTexts: readChecked(this.root, 'withTexts'),
          withImages: readChecked(this.root, 'withImages'),
          overwrite: readChecked(this.root, 'overwrite'),
        };
        try {
          const result =
            from === to
              ? await GenerationApi.generateDay({ date: from, ...payload })
              : await GenerationApi.generateWeek({ dateFrom: from, dateTo: to, ...payload });
          toast.success(`Прогон #${result.runId} запущен`);
          await this.refreshRuns();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '#loadPlan', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        const date = readValue(this.root, 'planDate');
        try {
          this.plan = await GenerationApi.dayPlan(date);
          this.render();
        } catch (e: unknown) {
          this.plan = null;
          toast.error(errorText(e));
        }
      });
    });
  }

  private startPolling(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      void this.refreshRuns();
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  private async refreshRuns(): Promise<void> {
    try {
      this.runs = await GenerationApi.runs(20);
    } catch {
      // Сетевой сбой на поллинге не должен ломать экран — следующая итерация повторит.
      return;
    }
    const active = this.runs.some((r) => r.status === 'pending' || r.status === 'running');
    if (!active) this.stopPolling();
    this.render();
  }
}

function statusKind(status: string): string {
  if (status === 'done') return 'ok';
  if (status === 'failed') return 'error';
  if (status === 'partial') return 'warn';
  return '';
}
