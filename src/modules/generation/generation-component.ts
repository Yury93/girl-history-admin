import { GenerationApi, ModesApi, ReferencesApi, WeekGridApi } from '../../api/engine-api.js';
import { creditsExhaustedText, errorText } from '../../api/http.js';
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
  screenHead,
  table,
} from '../../ui/screen.js';
import { gotoTab, isTabName, type TabName } from '../../types/tab.js';
import { SLOT_TITLES, type DayPlan, type GenerationRun, type Slot } from '../../types/engine.js';

/** Пока прогон идёт, статус опрашивается с этим интервалом. */
const POLL_MS = 2000;

/** Пункт чеклиста готовности. `warn` — не блокер, а деградация (без событий, без SoulId). */
interface ReadinessItem {
  ok: boolean;
  warn?: boolean;
  text: string;
  goto?: TabName;
}

/**
 * Запуск генерации и разбор результата.
 *
 * Одновременно живёт максимум ОДИН прогон: второй запуск получает 409. Поллинг гасится в
 * `deactivate()` и на терминальном статусе — иначе таймеры копились бы при переключении вкладок.
 *
 * Значения формы живут в `this.form`, а не только в DOM: поллинг перерисовывает экран каждые
 * две секунды, и без этого выбранные даты и галочки сбрасывались бы прямо под руками.
 */
export class GenerationComponent extends BaseScreen {
  private runs: GenerationRun[] = [];
  private plan: DayPlan | null = null;
  private readiness: ReadinessItem[] | null = null;
  private timer: number | null = null;
  private bound = false;
  private form = {
    from: toDateInputValue(new Date()),
    to: toDateInputValue(new Date()),
    withTexts: true,
    withImages: false,
    overwrite: false,
    planDate: toDateInputValue(new Date()),
  };

  protected async load(): Promise<void> {
    this.runs = await GenerationApi.runs(20);
  }

  deactivate(): void {
    this.stopPolling();
  }

  protected render(): void {
    const active = this.runs.find((r) => r.status === 'pending' || r.status === 'running') ?? null;

    this.root.innerHTML = `
      ${screenHead(
        'Генерация',
        'Сценарий дня собирается детерминированно; LLM только пишет тексты по готовому плану.',
        '',
        'generation'
      )}
      ${card(
        'Запуск',
        `<div class="grid-2">
           ${field('С даты', `<input type="date" data-name="from" value="${this.form.from}" />`)}
           ${field('По дату', `<input type="date" data-name="to" value="${this.form.to}" />`)}
         </div>
         <div class="checks">
           ${checkbox('withTexts', this.form.withTexts, 'Писать тексты (вызовы LLM, стоит денег)')}
           ${checkbox('withImages', this.form.withImages, 'Генерировать картинки (нужен включённый Higgsfield)')}
           ${checkbox('overwrite', this.form.overwrite, 'Перезаписывать дни с ручными правками')}
         </div>
         <p class="hint">Без «перезаписывать» день, где есть хоть один правленый пост,
            пропускается целиком и попадает в отчёт прогона.</p>
         <div class="run-actions">
           <button class="btn-primary" id="runGen" ${active === null ? '' : 'disabled'}>
             ${active === null ? 'Запустить' : `Идёт прогон #${active.id}`}
           </button>
           <button class="btn-secondary" id="checkReady">Проверить готовность</button>
         </div>
         ${this.readinessView()}`,
        '',
        undefined,
        'run-launch'
      )}
      ${card('Прогоны', this.runsTable(), '', 'run')}
      ${card(
        'Что выпало за день',
        `<div class="inline-form">
           <input type="date" data-name="planDate" value="${this.form.planDate}" />
           <button class="btn-secondary" id="loadPlan">Показать</button>
         </div>
         ${this.planView()}`,
        '',
        'slot'
      )}`;

    this.bind();
    if (active !== null) this.startPolling();
  }

  // ─── Чеклист готовности ────────────────────────────────────────────────────

  private readinessView(): string {
    const items = this.readiness;
    if (items === null) return '';
    const rows = items
      .map(
        (i) => `
        <li class="${i.ok ? 'ready-ok' : i.warn === true ? 'ready-warn' : 'ready-fail'}">
          <span class="ready-icon">${i.ok ? '✓' : '!'}</span>
          <span class="ready-text">${escapeHtml(i.text)}</span>
          ${i.goto === undefined ? '' : `<button class="btn-secondary btn-sm" data-goto="${i.goto}">Открыть</button>`}
        </li>`
      )
      .join('');
    return `<ul class="ready-list">${rows}</ul>`;
  }

  /**
   * Проверки те же, что сделает бэкенд при запуске (режим, сетка) плюс деградации,
   * о которых он молчит (план месяца, SoulId). Всё по уже открытым GET-эндпоинтам.
   */
  private async checkReadiness(): Promise<void> {
    const { from, to, withImages } = this.form;
    if (from === '' || to === '' || from > to) {
      toast.warn('Укажите корректный период: даты «с» и «по»');
      return;
    }
    const dates = dateRange(from, to);
    if (dates.length === 0 || dates.length > 92) {
      toast.warn('Период проверки — до 92 дней');
      return;
    }

    const items: ReadinessItem[] = [];
    try {
      const modes = await ModesApi.list();
      const uncovered = dates.filter((d) => !modes.some((m) => m.dateFrom <= d && d <= m.dateTo));
      items.push(
        uncovered.length === 0
          ? { ok: true, text: `Режимы покрывают весь период (${dates.length} дн.)` }
          : {
              ok: false,
              text: `Даты без режима — генерация упадёт: ${preview(uncovered)}`,
              goto: 'modes',
            }
      );

      // Какие weekday каждого режима реально встретятся в периоде — только их и проверяем.
      const usedModes = new Map<string, Set<string>>();
      for (const d of dates) {
        const mode = modes.find((m) => m.dateFrom <= d && d <= m.dateTo);
        if (mode === undefined) continue;
        const set = usedModes.get(mode.key) ?? new Set<string>();
        set.add(weekdayOf(d));
        usedModes.set(mode.key, set);
      }
      for (const [modeKey, weekdays] of usedModes) {
        const grid = await WeekGridApi.list(modeKey);
        const missing = [...weekdays].filter((wd) => {
          const day = grid.find((g) => g.weekday === wd);
          return day === undefined || day.slots.length === 0;
        });
        items.push(
          missing.length === 0
            ? { ok: true, text: `Сетка недели «${modeKey}» заполнена` }
            : {
                ok: false,
                text: `Сетка «${modeKey}»: не заполнены дни ${missing.join(', ')}`,
                goto: 'week-grid',
              }
        );
      }

      for (const month of monthsOf(dates)) {
        const plan = await GenerationApi.monthlyPlan(month).catch(() => null);
        items.push(
          plan !== null
            ? { ok: true, text: `План месяца ${month.slice(0, 7)} сгенерирован` }
            : {
                ok: false,
                warn: true,
                text: `Плана месяца ${month.slice(0, 7)} нет — дни выйдут без отклонений и событий`,
                goto: 'deviations',
              }
        );
      }

      if (withImages) {
        const refs = await ReferencesApi.list();
        const etalon = refs.find((r) => r.isEtalon) ?? null;
        const ready = etalon !== null && etalon.hasFile && etalon.soulId !== null;
        items.push(
          ready
            ? { ok: true, text: `Эталон с файлом и SoulId на месте (${etalon.key})` }
            : {
                ok: false,
                warn: true,
                text: 'Нет эталона с файлом и SoulId — картинки будут без консистентности внешности',
                goto: 'references',
              }
        );
      }
    } catch (e: unknown) {
      toast.error(errorText(e));
      return;
    }

    this.readiness = items;
    this.render();
  }

  // ─── Прогоны ───────────────────────────────────────────────────────────────

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

  // Сырые сообщения провайдеров («DeepSeek вернул 402: …») переводятся в человеческие:
  // оператор должен сразу видеть «недостаточно кредитов», а не JSON из недр API.
  private reportText(run: GenerationRun): string {
    if (run.error !== null) {
      return `<span class="warn-text">${escapeHtml(creditsExhaustedText(run.error) ?? run.error)}</span>`;
    }
    if (run.report.length === 0) return '—';
    return run.report
      .map((e) => {
        const detail =
          e.detail === undefined ? '' : ` (${creditsExhaustedText(e.detail) ?? e.detail})`;
        return escapeHtml(`${e.date}: ${e.reason}${detail}`);
      })
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

    // Форма — в состоянии компонента: перерисовка поллинга берёт значения отсюда.
    this.root.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      switch (target.dataset.name) {
        case 'from':
          this.form.from = target.value;
          break;
        case 'to':
          this.form.to = target.value;
          break;
        case 'planDate':
          this.form.planDate = target.value;
          break;
        case 'withTexts':
          this.form.withTexts = target.checked;
          break;
        case 'withImages':
          this.form.withImages = target.checked;
          break;
        case 'overwrite':
          this.form.overwrite = target.checked;
          break;
      }
    });

    onClick(this.root, '#runGen', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        const { from, to, withTexts, withImages, overwrite } = this.form;
        const payload = { withTexts, withImages, overwrite };
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

    onClick(this.root, '#checkReady', (btn) => {
      void withBusy(btn as HTMLButtonElement, () => this.checkReadiness());
    });

    onClick(this.root, '[data-goto]', (btn) => {
      const tab = btn.dataset.goto ?? '';
      if (isTabName(tab)) gotoTab(tab);
    });

    onClick(this.root, '#loadPlan', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          this.plan = await GenerationApi.dayPlan(this.form.planDate);
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

/** Даты периода включительно, `YYYY-MM-DD`. UTC — как считает дни бэкенд. */
function dateRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const result: string[] = [];
  if (Number.isNaN(start) || Number.isNaN(end)) return result;
  for (let t = start; t <= end && result.length <= 92; t += 86_400_000) {
    result.push(new Date(t).toISOString().slice(0, 10));
  }
  return result;
}

/** День недели в формате сида: JS getUTCDay() даёт 0=воскресенье — маппинг именно такой. */
function weekdayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] ?? 'mon';
}

/** Первые числа месяцев, покрытых периодом, — формат параметра monthly-plan. */
function monthsOf(dates: string[]): string[] {
  return [...new Set(dates.map((d) => `${d.slice(0, 7)}-01`))];
}

function preview(dates: string[]): string {
  return dates.slice(0, 4).join(', ') + (dates.length > 4 ? ` и ещё ${dates.length - 4}` : '');
}
