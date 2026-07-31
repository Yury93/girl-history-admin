import { LocationsApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { BaseScreen, badge, card, screenHead, table } from '../../ui/screen.js';
import type { EngineLocation, WardrobeLook } from '../../types/engine.js';

/**
 * Локации и гардероб.
 *
 * `titleEn` — не украшение: промпт изображения целиком английский, а `title` русский.
 * Локация без единого лука подсвечена: для неё сработает фолбэк «лук предыдущего слота»
 * и поднимется алерт — выдумывать одежду движок не имеет права.
 */
export class LocationsComponent extends BaseScreen {
  private locations: EngineLocation[] = [];
  private looks: WardrobeLook[] = [];
  private bound = false;

  protected async load(): Promise<void> {
    [this.locations, this.looks] = await Promise.all([LocationsApi.list(), LocationsApi.looks()]);
  }

  protected render(): void {
    const withLooks = new Set(this.looks.flatMap((l) => l.locationKeys));
    const orphans = this.locations.filter((l) => !withLooks.has(l.key));

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
      ${card('Локации', this.locationsTable(withLooks))}
      ${card('Гардероб', this.looksTable(), '', 'look')}`;
    this.bind();
  }

  private locationsTable(withLooks: Set<string>): string {
    return table(
      ['Ключ', 'Название', 'Английское имя (промпт)', 'Тип', 'Сезон', 'Зоны', ''],
      this.locations.map(
        (l) => `<tr class="${withLooks.has(l.key) ? '' : 'row-warn'}">
          <td><code>${escapeHtml(l.key)}</code></td>
          <td><input type="text" data-loc-title="${escapeHtml(l.key)}" value="${escapeHtml(l.title)}" /></td>
          <td><input type="text" data-loc-en="${escapeHtml(l.key)}" value="${escapeHtml(l.titleEn)}" /></td>
          <td>${badge(l.type)}</td>
          <td>${escapeHtml(l.season ?? '—')}</td>
          <td class="small">${l.zones.map((z) => escapeHtml(z.key)).join(', ') || '—'}</td>
          <td>
            <button class="btn-secondary btn-sm" data-save-loc="${escapeHtml(l.key)}">Сохранить</button>
            <button class="btn-danger btn-sm" data-del-loc="${escapeHtml(l.key)}">Удалить</button>
          </td>
        </tr>`
      )
    );
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
        try {
          await LocationsApi.update(key, { title, titleEn });
          toast.success('Локация сохранена');
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
