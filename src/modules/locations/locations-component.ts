import { LocationsApi, ReferencesApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { BaseScreen, badge, card, screenHead, table } from '../../ui/screen.js';
import type { EngineLocation, ReferenceImage, WardrobeLook } from '../../types/engine.js';

/**
 * Локации и гардероб.
 *
 * `titleEn` — не украшение: промпт изображения целиком английский, а `title` русский.
 * `sceneEn` — описание сцены из ТЗ «Референсы локаций» §6: второго слота референса у
 * провайдера НЕТ (проба Р1 2026-08-04), постоянство мест держится этим текстом.
 * Привязка референсов правится здесь же: признак «файл загружен» важнее превью —
 * запись референса есть почти у всех, а ФАЙЛ загружен у единиц, и без признака локация
 * выглядит «оформленной», хотя движку прикладывать нечего.
 * Локация без единого лука подсвечена: для неё сработает фолбэк «лук предыдущего слота»
 * и поднимется алерт — выдумывать одежду движок не имеет права.
 */
export class LocationsComponent extends BaseScreen {
  private locations: EngineLocation[] = [];
  private looks: WardrobeLook[] = [];
  private references: ReferenceImage[] = [];
  /** Ключ локации с раскрытым редактором привязки референсов. */
  private refEditorKey: string | null = null;
  private bound = false;

  protected async load(): Promise<void> {
    [this.locations, this.looks, this.references] = await Promise.all([
      LocationsApi.list(),
      LocationsApi.looks(),
      ReferencesApi.list(),
    ]);
  }

  protected render(): void {
    const withLooks = new Set(this.looks.flatMap((l) => l.locationKeys));
    const orphans = this.locations.filter((l) => !withLooks.has(l.key));
    const noRefs = this.locations.filter((l) => l.type !== 'studio' && l.refKeys.length === 0);

    this.root.innerHTML = `
      ${screenHead(
        'Локации и гардероб',
        `${this.locations.length} локаций, ${this.looks.length} луков.`,
        '',
        'locations'
      )}
      ${
        orphans.length === 0
          ? ''
          : card(
              'Локации без луков',
              `<p class="hint">Для них сработает фолбэк «лук предыдущего слота» и поднимется
                 алерт: ${orphans.map((o) => badge(o.key, 'warn')).join(' ')}</p>`,
              'card-warn'
            )
      }
      ${
        noRefs.length === 0
          ? ''
          : card(
              'Локации без референсов',
              `<p class="hint">Референс места не привязан — кадру не с чего держать
                 постоянство: ${noRefs.map((o) => badge(o.key, 'warn')).join(' ')}</p>`,
              'card-warn'
            )
      }
      ${card('Локации', this.locationsTable(withLooks))}
      ${card('Гардероб', this.looksTable(), '', 'look', 'wardrobe')}`;
    this.bind();
  }

  private locationsTable(withLooks: Set<string>): string {
    const rows: string[] = [];
    for (const l of this.locations) {
      rows.push(`<tr class="${withLooks.has(l.key) ? '' : 'row-warn'}">
          <td><code>${escapeHtml(l.key)}</code></td>
          <td><input type="text" data-loc-title="${escapeHtml(l.key)}" value="${escapeHtml(l.title)}" /></td>
          <td><input type="text" data-loc-en="${escapeHtml(l.key)}" value="${escapeHtml(l.titleEn)}" /></td>
          <td><textarea rows="2" data-loc-scene="${escapeHtml(l.key)}"
                placeholder="английское описание сцены">${escapeHtml(l.sceneEn ?? '')}</textarea></td>
          <td>${badge(l.type)}</td>
          <td>${escapeHtml(l.season ?? '—')}</td>
          <td class="small">${this.refsCell(l)}</td>
          <td class="small">${l.zones.map((z) => escapeHtml(z.key)).join(', ') || '—'}</td>
          <td>
            <button class="btn-secondary btn-sm" data-save-loc="${escapeHtml(l.key)}">Сохранить</button>
            <button class="btn-danger btn-sm" data-del-loc="${escapeHtml(l.key)}">Удалить</button>
          </td>
        </tr>`);
      if (this.refEditorKey === l.key) rows.push(this.refEditorRow(l));
    }
    return table(
      ['Ключ', 'Название', 'Имя (промпт)', 'Сцена (EN)', 'Тип', 'Сезон', 'Референсы', 'Зоны', ''],
      rows
    );
  }

  /** Признак файла честный: запись есть почти всегда, файл — нет. */
  private refsCell(l: EngineLocation): string {
    const refByKey = new Map(this.references.map((r) => [r.key, r]));
    const badges =
      l.refKeys.length === 0
        ? badge('нет референсов', 'error')
        : l.refKeys
            .map((k) => {
              const r = refByKey.get(k);
              const kind = r?.hasFile === true ? 'ok' : 'warn';
              return badge(r === undefined ? `${k} (нет записи)` : k, kind);
            })
            .join(' ');
    return `${badges}<br/>
      <button class="btn-secondary btn-sm" data-edit-refs="${escapeHtml(l.key)}">
        ${this.refEditorKey === l.key ? 'Свернуть' : 'Привязать'}
      </button>`;
  }

  /** Раскрывающаяся строка с чекбоксами всех референсов — привязка без ручного JSON. */
  private refEditorRow(l: EngineLocation): string {
    const chosen = new Set(l.refKeys);
    const byCategory = new Map<string, ReferenceImage[]>();
    for (const r of this.references) {
      const list = byCategory.get(r.category) ?? [];
      list.push(r);
      byCategory.set(r.category, list);
    }
    const groups = [...byCategory.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([cat, refs]) => `<div class="ref-pick-group">
          <b>${escapeHtml(cat)}</b>
          ${refs
            .map(
              (r) => `<label class="checkbox">
                <input type="checkbox" data-ref-check="${escapeHtml(r.key)}"
                  ${chosen.has(r.key) ? 'checked' : ''} />
                ${escapeHtml(r.key)}${r.hasFile ? '' : ' <span class="warn-text">(без файла)</span>'}
              </label>`
            )
            .join(' ')}
        </div>`
      )
      .join('');
    return `<tr class="ref-editor-row"><td colspan="9" data-ref-editor="${escapeHtml(l.key)}">
        <p class="hint">Референсы места для «${escapeHtml(l.key)}». Ключи — из ТЗ «Референсы
          локаций» §8 (loc-*); файл можно загрузить на вкладке «Референсы» — запись с
          опознаваемым префиксом создастся сама.</p>
        ${groups}
        <button class="btn-primary btn-sm" data-save-refs="${escapeHtml(l.key)}">Сохранить привязку</button>
        <button class="btn-secondary btn-sm" data-cancel-refs>Отмена</button>
      </td></tr>`;
  }

  private looksTable(): string {
    return table(
      ['Ключ', 'Название', 'Состав', 'Локации', 'Режим', 'Причёска', 'Вкл'],
      this.looks.map(
        (l) => `<tr class="${l.isActive ? '' : 'row-off'}">
          <td><code>${escapeHtml(l.key)}</code></td>
          <td>${escapeHtml(l.title)}</td>
          <td class="small">${escapeHtml(l.items.join(', '))}</td>
          <td class="small">${l.locationKeys.map((k) => badge(k)).join(' ')}</td>
          <td>${escapeHtml(l.mode ?? 'любой')}</td>
          <td>${escapeHtml(l.hair ?? '—')}</td>
          <td><label class="checkbox"><input type="checkbox" data-look-active="${escapeHtml(l.key)}"
                ${l.isActive ? 'checked' : ''} /></label></td>
        </tr>`
      )
    );
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '[data-save-loc]', (btn) => {
      const key = btn.dataset.saveLoc ?? '';
      void withBusy(btn as HTMLButtonElement, async () => {
        const title =
          this.root.querySelector<HTMLInputElement>(`[data-loc-title="${key}"]`)?.value.trim() ??
          '';
        const titleEn =
          this.root.querySelector<HTMLInputElement>(`[data-loc-en="${key}"]`)?.value.trim() ?? '';
        const scene =
          this.root.querySelector<HTMLTextAreaElement>(`[data-loc-scene="${key}"]`)?.value.trim() ??
          '';
        try {
          await LocationsApi.update(key, { title, titleEn, sceneEn: scene === '' ? null : scene });
          toast.success('Локация сохранена');
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-edit-refs]', (btn) => {
      const key = btn.dataset.editRefs ?? '';
      this.refEditorKey = this.refEditorKey === key ? null : key;
      this.render();
    });

    onClick(this.root, '[data-cancel-refs]', () => {
      this.refEditorKey = null;
      this.render();
    });

    onClick(this.root, '[data-save-refs]', (btn) => {
      const key = btn.dataset.saveRefs ?? '';
      void withBusy(btn as HTMLButtonElement, async () => {
        const editor = this.root.querySelector(`[data-ref-editor="${key}"]`);
        if (editor === null) return;
        const refKeys = [...editor.querySelectorAll<HTMLInputElement>('[data-ref-check]')]
          .filter((c) => c.checked)
          .map((c) => c.dataset.refCheck ?? '')
          .filter((k) => k !== '');
        try {
          await LocationsApi.update(key, { refKeys });
          toast.success('Привязка сохранена');
          this.refEditorKey = null;
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-del-loc]', (btn) => {
      const key = btn.dataset.delLoc ?? '';
      void (async () => {
        const ok = await confirmDialog({
          title: `Удалить локацию «${key}»?`,
          message:
            'Если на неё ссылаются сетка недели или луки, сервер ответит 409. Подтверждение ' +
            'здесь означает force: ключ будет вычищен из этих записей.',
          danger: true,
          confirmLabel: 'Удалить и вычистить ссылки',
        });
        if (!ok) return;
        try {
          await LocationsApi.remove(key, true);
          toast.success('Локация удалена');
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      })();
    });

    this.root.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const key = target.dataset.lookActive;
      if (key === undefined) return;
      void LocationsApi.updateLook(key, { isActive: target.checked })
        .then(() => toast.success('Сохранено'))
        .catch((e: unknown) => toast.error(errorText(e)));
    });
  }
}
