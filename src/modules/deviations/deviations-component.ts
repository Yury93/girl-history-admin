import { DeviationsApi, GenerationApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { toDateInputValue } from '../../ui/format.js';
import { BaseScreen, badge, card, emptyBox, helpMark, screenHead, table } from '../../ui/screen.js';
import type { Deviation, MonthlyPlan, SocialEvent } from '../../types/engine.js';

/**
 * Отклонения, социальные события и месячный план.
 *
 * План месяца перегенерируется целиком, но заменяет ТОЛЬКО записи с датой >= сегодня:
 * прошлое уже разыграно и разошлось по постам.
 */
export class DeviationsComponent extends BaseScreen {
  private deviations: Deviation[] = [];
  private social: SocialEvent[] = [];
  private plan: MonthlyPlan | null = null;
  private month = firstOfCurrentMonth();
  private bound = false;

  protected async load(): Promise<void> {
    [this.deviations, this.social] = await Promise.all([
      DeviationsApi.list(),
      DeviationsApi.social(),
    ]);
    this.plan = await GenerationApi.monthlyPlan(this.month).catch(() => null);
  }

  protected render(): void {
    this.root.innerHTML = `
      ${screenHead(
        'Отклонения и события',
        'Норма/вариация/эпизод — 70/25/5. Эпизоды не слипаются и не падают на арочные даты.',
        '',
        'deviations'
      )}
      ${card('Отклонения', this.deviationsTable(), '', 'deviation')}
      ${card('Социальные события', this.socialTable(), '', 'socialEvent')}
      ${card(
        'План месяца',
        `<div class="inline-form">
           <input type="date" data-name="month" value="${escapeHtml(this.month)}" />
           <button class="btn-primary" id="genPlan">Сгенерировать план</button>
           <button class="btn-secondary" id="loadPlan">Показать</button>
         </div>
         ${this.planView()}`
      )}`;
    this.bind();
  }

  private deviationsTable(): string {
    return table(
      ['Ключ', 'Название', 'В месяц', 'Последствие / сигнал', 'Вкл'],
      this.deviations.map(
        (d) => `<tr class="${d.isActive ? '' : 'row-off'}">
          <td><code>${escapeHtml(d.key)}</code></td>
          <td>${escapeHtml(d.title)}</td>
          <td>${d.timesPerMonthMin}–${d.timesPerMonthMax}</td>
          <td class="small">${escapeHtml(d.consequence ?? d.signal ?? '—')}</td>
          <td><label class="checkbox"><input type="checkbox" data-dev-active="${escapeHtml(d.key)}"
                ${d.isActive ? 'checked' : ''} /></label></td>
        </tr>`
      )
    );
  }

  private socialTable(): string {
    return table(
      ['Ключ', 'Вид', 'Название', 'Частота', 'С недели', 'Вкл'],
      this.social.map(
        (s) => `<tr class="${s.isActive ? '' : 'row-off'}">
          <td><code>${escapeHtml(s.key)}</code></td>
          <td>${badge(s.kind)}</td>
          <td>${escapeHtml(s.title)}</td>
          <td class="small">${
            s.frequencyPerMonthMin === null
              ? s.rotationWeeksMin === null
                ? '—'
                : `ротация ${s.rotationWeeksMin}-${s.rotationWeeksMax ?? '?'} нед.`
              : `${s.frequencyPerMonthMin}–${s.frequencyPerMonthMax ?? '?'}/мес`
          }</td>
          <td>${s.startWeek ?? '—'}</td>
          <td><label class="checkbox"><input type="checkbox" data-soc-active="${escapeHtml(s.key)}"
                ${s.isActive ? 'checked' : ''} /></label></td>
        </tr>`
      )
    );
  }

  private planView(): string {
    const plan = this.plan;
    if (plan === null) return emptyBox('План на этот месяц не сгенерирован');

    const byDate = new Map<string, string[]>();
    for (const e of plan.entries) {
      const list = byDate.get(e.date) ?? [];
      list.push(`${e.kind}:${e.key}`);
      byDate.set(e.date, list);
    }

    const rows = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([date, items]) =>
          `<tr><td>${escapeHtml(date)}</td><td>${items.map((i) => badge(i)).join(' ')}</td></tr>`
      );

    return `<p class="hint">Зерно${helpMark('seed')} <code>${escapeHtml(plan.seed)}</code>, записей ${plan.entries.length}.</p>
      ${table(['Дата', 'Что запланировано'], rows)}`;
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '#genPlan', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        this.month = this.readMonth();
        try {
          this.plan = await GenerationApi.generateMonthlyPlan(this.month);
          toast.success(`План на ${this.month} сгенерирован`);
          this.render();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '#loadPlan', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        this.month = this.readMonth();
        this.plan = await GenerationApi.monthlyPlan(this.month).catch(() => null);
        this.render();
      });
    });

    this.root.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      const devKey = target.dataset.devActive;
      if (devKey !== undefined) {
        void DeviationsApi.update(devKey, { isActive: target.checked })
          .then(() => toast.success('Сохранено'))
          .catch((e: unknown) => toast.error(errorText(e)));
      }
      const socKey = target.dataset.socActive;
      if (socKey !== undefined) {
        void DeviationsApi.updateSocial(socKey, { isActive: target.checked })
          .then(() => toast.success('Сохранено'))
          .catch((e: unknown) => toast.error(errorText(e)));
      }
    });
  }

  private readMonth(): string {
    const raw =
      this.root.querySelector<HTMLInputElement>('[data-name="month"]')?.value.trim() ?? '';
    return raw === '' ? this.month : raw;
  }
}

function firstOfCurrentMonth(): string {
  const now = new Date();
  return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}
