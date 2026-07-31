import { PoolsApi, RegistryApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { BaseScreen, badge, screenHead, table } from '../../ui/screen.js';
import { SLOT_TITLES, type Pool, type RegistryRow, type Slot } from '../../types/engine.js';

const PAGE = 100;

/**
 * Реестр вариаций — обязательный вход генератора, а не вспомогательный лог (ТЗ §4).
 *
 * Смотреть его глазами нужно ровно для одного вопроса: «почему сегодня выпало именно это».
 * При перегенерации реестр не очищается — удаляются только записи переписываемого дня.
 */
export class RegistryComponent extends BaseScreen {
  private rows: RegistryRow[] = [];
  private total = 0;
  private pools: Pool[] = [];
  private poolKey = '';
  private offset = 0;
  private bound = false;

  protected async load(): Promise<void> {
    if (this.pools.length === 0) this.pools = await PoolsApi.list();
    const params: Record<string, string | number> = { limit: PAGE, offset: this.offset };
    if (this.poolKey !== '') params.poolKey = this.poolKey;
    const result = await RegistryApi.list(params);
    this.rows = result.items;
    this.total = result.total;
  }

  protected render(): void {
    const options = this.pools
      .map(
        (p) =>
          `<option value="${escapeHtml(p.key)}" ${p.key === this.poolKey ? 'selected' : ''}>${escapeHtml(p.title)}</option>`
      )
      .join('');

    this.root.innerHTML = `
      ${screenHead(
        'Реестр вариаций',
        `${this.total} записей. Каждая — «в этот день, в этом слоте, из этого пула выпало это».`,
        '',
        'registry'
      )}
      <div class="filters" data-tour="registry-filters">
        <select data-name="poolKey">
          <option value="">все пулы</option>
          ${options}
        </select>
        <button class="btn-secondary" id="applyPool">Показать</button>
        <span class="spacer"></span>
        <button class="btn-secondary" id="prevPage" ${this.offset === 0 ? 'disabled' : ''}>←</button>
        <span class="small">${this.offset + 1}–${Math.min(this.offset + PAGE, this.total)}</span>
        <button class="btn-secondary" id="nextPage"
          ${this.offset + PAGE >= this.total ? 'disabled' : ''}>→</button>
      </div>
      ${table(
        ['Дата', 'Слот', 'Пул', 'Позиция', 'Прогон'],
        this.rows.map(
          (r) => `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(SLOT_TITLES[r.slot as Slot] ?? r.slot)}</td>
            <td>${badge(r.poolKey)}</td>
            <td>${escapeHtml(r.text ?? r.itemKey)}</td>
            <td class="small">${r.runId ?? '—'}</td>
          </tr>`
        )
      )}`;
    this.bind();
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '#applyPool', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        this.poolKey =
          this.root.querySelector<HTMLSelectElement>('[data-name="poolKey"]')?.value ?? '';
        this.offset = 0;
        this.invalidate();
        await this.reload();
      });
    });

    onClick(this.root, '#prevPage', () => {
      this.offset = Math.max(0, this.offset - PAGE);
      this.invalidate();
      void this.reload().catch((e: unknown) => toast.error(errorText(e)));
    });

    onClick(this.root, '#nextPage', () => {
      this.offset += PAGE;
      this.invalidate();
      void this.reload().catch((e: unknown) => toast.error(errorText(e)));
    });
  }
}
