import { ActionsApi, LocationsApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { BaseScreen, badge, card, emptyBox, screenHead, select, table } from '../../ui/screen.js';
import type { EngineAction, EngineLocation } from '../../types/engine.js';

/**
 * Действия в кадре (ТЗ v1.1 §5.1: «вывести отдельный экран „Действия“ рядом с „Пулами“ —
 * с фильтром по локации и возможностью добавлять записи»).
 *
 * Смысл справочника: движок отвечал на вопрос «где она находится», а должен отвечать на
 * «что она делает». Поэтому экран показывает не просто список, а покрытие: локация без
 * действий даст пост-заглушку, а локация с одним-двумя — вырожденный кулдаун.
 */
export class ActionsComponent extends BaseScreen {
  private actions: EngineAction[] = [];
  private locations: EngineLocation[] = [];
  /** Состояние фильтра — ПОЛЕ класса, иначе выбор слетал бы на каждом render. */
  private location = '';
  private bound = false;

  protected async load(): Promise<void> {
    [this.actions, this.locations] = await Promise.all([
      ActionsApi.list(this.location === '' ? undefined : this.location),
      LocationsApi.list(),
    ]);
  }

  protected render(): void {
    const total = this.actions.length;
    this.root.innerHTML = `
      ${screenHead(
        'Действия в кадре',
        `${total} ${this.location === '' ? 'действий' : `в локации «${escapeHtml(this.location)}»`}. ` +
          'Действие выбирается по локации слота: локация — фон, действие — содержание кадра.',
        '',
        'actions'
      )}
      ${this.coverageCard()}
      ${card(
        'Новое действие',
        `<div class="grid-2">
           <input type="text" data-name="key" placeholder="Ключ (латиница): lo_latte_art_cat" />
           ${select(
             'locationKey',
             this.location,
             this.locations.map((l) => ({ value: l.key, label: `${l.key} — ${l.title}` }))
           )}
         </div>
         <input type="text" data-name="titleRu" placeholder="Название по-русски: «Латте-арт: кот на пенке»" />
         <input type="text" data-name="actionEn" placeholder="action_en — что она делает, по-английски (уходит в промпт картинки)" />
         <div class="grid-2">
           <input type="text" data-name="prop" placeholder="Предмет, обязанный быть виден в кадре" />
           <input type="text" data-name="framing" placeholder="Крупность и ракурс" />
         </div>
         <input type="text" data-name="postAngleRu" placeholder="О чём пост — уходит в промпт текста" />
         <input type="text" data-name="tags" placeholder="Теги через запятую: hero, vote, arc" />
         <button class="btn-primary" id="addAction">Добавить</button>`,
        '',
        undefined,
        'new-action'
      )}
      ${card('Фильтр по локации', this.filterRow())}
      ${total === 0 ? emptyBox('Действий нет. Импортируйте справочники или добавьте вручную.') : card('Список', this.actionsTable())}`;
    this.bind();
  }

  /**
   * Покрытие локаций. Числа тут важнее списка: кулдаун «треть списка» при одном действии
   * невозможен, при двух вырождается в жёсткое чередование, а локация без действий вернёт
   * кадр «стоит в локации» — ровно то, ради чего писалось ТЗ.
   */
  private coverageCard(): string {
    if (this.location !== '') return '';
    const byLocation = new Map<string, number>();
    for (const a of this.actions)
      byLocation.set(a.locationKey, (byLocation.get(a.locationKey) ?? 0) + 1);

    const rows = this.locations
      .map((l) => ({ l, n: byLocation.get(l.key) ?? 0 }))
      .sort((a, b) => a.n - b.n)
      .filter((r) => r.n <= 2)
      .map(
        (r) => `<tr class="${r.n === 0 ? 'row-warn' : ''}">
          <td><code>${escapeHtml(r.l.key)}</code></td>
          <td>${escapeHtml(r.l.title)}</td>
          <td>${badge(String(r.n), r.n === 0 ? 'error' : 'warn')}</td>
          <td class="small">${
            r.n === 0
              ? 'нет ни одного действия — пост вернётся к кадру «стоит в локации»'
              : 'кулдаун «треть списка» вырождается'
          }</td>
        </tr>`
      );

    if (rows.length === 0) return '';
    return card(
      'Локации, где действий не хватает',
      table(['Ключ', 'Локация', 'Действий', 'Что это значит'], rows),
      'card-warn'
    );
  }

  private filterRow(): string {
    return `<div class="filters">
      ${select('filterLocation', this.location, [
        { value: '', label: 'Все локации' },
        ...this.locations.map((l) => ({ value: l.key, label: `${l.key} — ${l.title}` })),
      ])}
      <button class="btn-secondary" id="applyFilter">Показать</button>
    </div>`;
  }

  private actionsTable(): string {
    return table(
      ['Ключ', 'Локация', 'Название', 'Действие (в промпт картинки)', 'Предмет', 'Теги', ''],
      this.actions.map(
        (a) => `<tr class="${a.isActive ? '' : 'row-off'}">
          <td><code>${escapeHtml(a.key)}</code></td>
          <td><code>${escapeHtml(a.locationKey)}</code></td>
          <td>${escapeHtml(a.titleRu)}</td>
          <td class="small">${escapeHtml(a.actionEn)}</td>
          <td class="small">${escapeHtml(a.prop)}</td>
          <td>${a.tags.map((t) => badge(t, t === 'hero' ? 'ok' : '')).join(' ')}</td>
          <td>
            <button class="btn-secondary btn-sm" data-toggle="${escapeHtml(a.key)}">
              ${a.isActive ? 'Погасить' : 'Включить'}
            </button>
          </td>
        </tr>`
      )
    );
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '#applyFilter', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        this.location =
          this.root.querySelector<HTMLSelectElement>('[data-name="filterLocation"]')?.value ?? '';
        this.invalidate();
        await this.reload();
      });
    });

    onClick(this.root, '#addAction', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        const read = (name: string): string =>
          this.root.querySelector<HTMLInputElement>(`[data-name="${name}"]`)?.value.trim() ?? '';
        const key = read('key');
        if (key === '') {
          toast.warn('Укажите ключ — на него ссылается реестр вариаций');
          return;
        }
        try {
          await ActionsApi.create({
            key,
            locationKey:
              this.root.querySelector<HTMLSelectElement>('[data-name="locationKey"]')?.value ?? '',
            titleRu: read('titleRu'),
            actionEn: read('actionEn'),
            prop: read('prop'),
            framing: read('framing'),
            postAngleRu: read('postAngleRu'),
            tags: read('tags')
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t !== ''),
          });
          toast.success('Действие добавлено');
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    // Гасим флагом, а не удаляем: удаление рвёт ссылки реестра вариаций.
    onClick(this.root, '[data-toggle]', (btn) => {
      const key = btn.dataset.toggle ?? '';
      const current = this.actions.find((a) => a.key === key);
      if (current === undefined) return;
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          await ActionsApi.update(key, { isActive: !current.isActive });
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });
  }
}
