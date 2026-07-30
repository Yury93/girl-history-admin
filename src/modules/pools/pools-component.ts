import { PoolsApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { BaseScreen, badge, card, screenHead, table } from '../../ui/screen.js';
import type { Pool, PoolAlert } from '../../types/engine.js';

/**
 * Пулы вариаций и позиции.
 *
 * Правила пула показаны только на чтение: они разобраны из `cooldownRaw` при импорте, и
 * править их «на глаз» опаснее, чем поправить исходную строку и переимпортировать.
 * Позиции править можно — кроме ключа: на него ссылается реестр вариаций.
 */
export class PoolsComponent extends BaseScreen {
  private pools: Pool[] = [];
  private alerts: PoolAlert[] = [];
  private openKey: string | null = null;
  private bound = false;

  protected async load(): Promise<void> {
    [this.pools, this.alerts] = await Promise.all([PoolsApi.list(), PoolsApi.alerts()]);
  }

  protected render(): void {
    this.root.innerHTML = `
      ${screenHead(
        'Пулы вариаций',
        `${this.pools.length} пулов, ${this.pools.reduce((s, p) => s + p.items.length, 0)} позиций. ` +
          'Ключ позиции стабилен — на него ссылается реестр.',
        ''
      )}
      ${this.alerts.length === 0 ? '' : card('Требуют внимания', this.alertsTable(), 'card-warn')}
      <div class="pool-list">${this.pools.map((p) => this.poolCard(p)).join('')}</div>`;
    this.bind();
  }

  private alertsTable(): string {
    return table(
      ['Пул', 'Дата', 'Причина', 'Подробности', ''],
      this.alerts.map(
        (a) => `<tr>
          <td><code>${escapeHtml(a.poolKey)}</code></td>
          <td>${escapeHtml(a.date)}</td>
          <td>${badge(a.reason, a.reason === 'exhausted' ? 'error' : 'warn')}</td>
          <td class="small">${escapeHtml(a.detail ?? '')}</td>
          <td><button class="btn-secondary btn-sm" data-resolve="${a.id}">Закрыть</button></td>
        </tr>`
      )
    );
  }

  private poolCard(pool: Pool): string {
    const open = this.openKey === pool.key;
    const rules: string[] = [];
    if (pool.minGapItems !== null) rules.push(`пропуск ${pool.minGapItems} позиций`);
    if (pool.minGapDays !== null) rules.push(`${pool.minGapDays} дн.`);
    if (pool.noRepeatAdjacentDays) rules.push('не подряд');
    if (pool.categoryNotRepeatAdjacent) rules.push('категория не подряд');
    if (pool.categoryNotRepeatHauls !== null) rules.push(`${pool.categoryNotRepeatHauls} хаула`);
    if (pool.rotateAllBeforeRepeat) rules.push('круг целиком');
    if (pool.canonBias !== null) rules.push(`канон ${Math.round(pool.canonBias * 100)}%`);
    if (pool.styleSeasonWeeksMin !== null) {
      rules.push(`стиль ${pool.styleSeasonWeeksMin}-${pool.styleSeasonWeeksMax ?? '?'} нед.`);
    }
    if (pool.timesPerWeekMax !== null) {
      rules.push(`${pool.timesPerWeekMin ?? 0}-${pool.timesPerWeekMax}/нед.`);
    }

    return `
      <section class="card pool-card">
        <div class="pool-head" data-toggle="${escapeHtml(pool.key)}">
          <div>
            <h3>${escapeHtml(pool.title)} <code class="small">${escapeHtml(pool.key)}</code></h3>
            <div class="pool-rules">
              ${badge(pool.scope)} ${rules.map((r) => badge(r)).join(' ')}
              <span class="small">${pool.items.length} поз.</span>
            </div>
          </div>
          <button class="btn-secondary btn-sm">${open ? 'Свернуть' : 'Позиции'}</button>
        </div>
        ${open ? this.itemsTable(pool) : ''}
      </section>`;
  }

  private itemsTable(pool: Pool): string {
    const rows = pool.items.map(
      (i) => `<tr class="${i.isActive ? '' : 'row-off'}">
        <td class="mono small">${escapeHtml(i.key)}</td>
        <td><input type="text" data-item-text="${i.id}" value="${escapeHtml(i.text)}" /></td>
        <td><input type="text" class="narrow" data-item-cat="${i.id}"
              value="${escapeHtml(i.category ?? '')}" placeholder="—" /></td>
        <td>${i.isCanon ? badge('канон', 'ok') : ''}${
          i.maxPerUnit === null
            ? ''
            : badge(`${i.maxPerCount}×/${i.maxPerUnitCount} ${i.maxPerUnit}`)
        }</td>
        <td><label class="checkbox"><input type="checkbox" data-item-active="${i.id}"
              ${i.isActive ? 'checked' : ''} /></label></td>
        <td><button class="btn-secondary btn-sm" data-save-item="${i.id}"
              data-pool="${escapeHtml(pool.key)}">Сохранить</button></td>
      </tr>`
    );

    const categoryHint =
      pool.categoryNotRepeatAdjacent && pool.items.some((i) => i.category === null)
        ? `<p class="hint warn-text">У части позиций нет категории, а правило
             «категория не повторяется в соседние дни» задано — пока оно работает по самой
             позиции. Заполните категории, чтобы правило заработало как задумано.</p>`
        : '';

    return `${categoryHint}
      ${table(['Ключ', 'Текст', 'Категория', 'Флаги', 'Вкл', ''], rows)}
      <div class="inline-form">
        <input type="text" data-name="newItem-${escapeHtml(pool.key)}" placeholder="Новая позиция" />
        <button class="btn-secondary btn-sm" data-add-item="${escapeHtml(pool.key)}">Добавить</button>
      </div>`;
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '[data-toggle]', (el) => {
      const key = el.dataset.toggle ?? '';
      this.openKey = this.openKey === key ? null : key;
      this.render();
    });

    onClick(this.root, '[data-resolve]', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          await PoolsApi.resolveAlert(Number(btn.dataset.resolve));
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-save-item]', (btn) => {
      const id = Number(btn.dataset.saveItem);
      const poolKey = btn.dataset.pool ?? '';
      void withBusy(btn as HTMLButtonElement, async () => {
        const text =
          this.root.querySelector<HTMLInputElement>(`[data-item-text="${id}"]`)?.value.trim() ?? '';
        const category =
          this.root.querySelector<HTMLInputElement>(`[data-item-cat="${id}"]`)?.value.trim() ?? '';
        const isActive =
          this.root.querySelector<HTMLInputElement>(`[data-item-active="${id}"]`)?.checked ?? true;
        try {
          await PoolsApi.updateItem(poolKey, id, {
            text,
            category: category === '' ? null : category,
            isActive,
          });
          toast.success('Позиция сохранена');
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-add-item]', (btn) => {
      const poolKey = btn.dataset.addItem ?? '';
      void withBusy(btn as HTMLButtonElement, async () => {
        const input = this.root.querySelector<HTMLInputElement>(`[data-name="newItem-${poolKey}"]`);
        const text = input?.value.trim() ?? '';
        if (text === '') {
          toast.warn('Введите текст позиции');
          return;
        }
        try {
          await PoolsApi.createItem(poolKey, { text });
          toast.success('Позиция добавлена');
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });
  }
}
