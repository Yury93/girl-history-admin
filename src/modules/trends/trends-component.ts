import { TrendsApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { toDateInputValue } from '../../ui/format.js';
import { BaseScreen, badge, card, screenHead, table } from '../../ui/screen.js';
import type { TrendBrief } from '../../types/engine.js';

/**
 * Тренд-брифы. Заводятся руками — автосбора ТЗ не требует.
 *
 * Свежий бриф на дату подставляется в промпт дня и после успешной генерации переходит в
 * `used`: иначе один и тот же тренд шёл бы в ленту каждый день.
 */
export class TrendsComponent extends BaseScreen {
  private trends: TrendBrief[] = [];
  private bound = false;

  protected async load(): Promise<void> {
    const result = await TrendsApi.list({ limit: 100 });
    this.trends = result.items;
  }

  protected render(): void {
    const today = toDateInputValue(new Date());
    this.root.innerHTML = `
      ${screenHead(
        'Тренд-брифы',
        'Свежий бриф на дату вплетается в тексты дня; использованный автоматически становится used. ' +
          '«Не старше 48 часов» — редакционное правило, система его не проверяет.',
        '',
        'trends'
      )}
      ${card(
        'Новый бриф',
        `<div class="grid-2">
           <input type="date" data-name="date" value="${today}" />
           <input type="text" data-name="source" placeholder="Источник (tiktok, reels…)" />
         </div>
         <input type="text" data-name="topic" placeholder="Тема тренда" />
         <input type="text" data-name="angle" placeholder="Как отыгрывает Nova" />
         <input type="text" data-name="risk" placeholder="Проверка на риски" />
         <button class="btn-primary" id="addTrend">Добавить</button>`,
        '',
        undefined,
        'new-trend'
      )}
      ${card('Брифы', this.trendsTable())}`;
    this.bind();
  }

  private trendsTable(): string {
    return table(
      ['Дата', 'Источник', 'Тема', 'Как отыгрывает', 'Статус', ''],
      this.trends.map(
        (t) => `<tr>
          <td>${escapeHtml(t.date)}</td>
          <td>${escapeHtml(t.source)}</td>
          <td>${escapeHtml(t.topic)}</td>
          <td class="small">${escapeHtml(t.angleForNova)}</td>
          <td>${badge(t.status, t.status === 'used' ? 'ok' : t.status === 'rejected' ? 'error' : '')}</td>
          <td>
            ${
              t.status === 'new'
                ? `<button class="btn-secondary btn-sm" data-reject="${t.id}">Отклонить</button>`
                : ''
            }
            <button class="btn-danger btn-sm" data-del-trend="${t.id}">×</button>
          </td>
        </tr>`
      )
    );
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '#addTrend', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        const read = (name: string): string =>
          this.root.querySelector<HTMLInputElement>(`[data-name="${name}"]`)?.value.trim() ?? '';
        const topic = read('topic');
        if (topic === '') {
          toast.warn('Укажите тему тренда');
          return;
        }
        try {
          await TrendsApi.create({
            date: read('date'),
            source: read('source') === '' ? 'manual' : read('source'),
            topic,
            angleForNova: read('angle'),
            riskCheck: read('risk'),
          });
          toast.success('Бриф добавлен');
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-reject]', (btn) => {
      const id = Number(btn.dataset.reject);
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          await TrendsApi.update(id, { status: 'rejected' });
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-del-trend]', (btn) => {
      const id = Number(btn.dataset.delTrend);
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          await TrendsApi.remove(id);
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });
  }
}
