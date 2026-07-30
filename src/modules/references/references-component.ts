import { ReferencesApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { formatBytes } from '../../ui/format.js';
import {
  BaseScreen,
  badge,
  card,
  field,
  linesArea,
  readLines,
  screenHead,
} from '../../ui/screen.js';
import type { ReferenceImage } from '../../types/engine.js';

/**
 * Референсы персонажа.
 *
 * До загрузки эталона SoulId не создаётся и картинки не генерируются — но промпты
 * собираются и сохраняются в постах. Эталон ровно один: отметка нового снимает старую.
 *
 * SoulId создаётся из ПУБЛИЧНОГО URL картинки, а не из файла. Локально этот адрес извне
 * недоступен, поэтому кнопка осмысленна только на проде.
 */
export class ReferencesComponent extends BaseScreen {
  private references: ReferenceImage[] = [];
  private rules: string[] = [];
  private bound = false;

  protected async load(): Promise<void> {
    [this.references, this.rules] = await Promise.all([
      ReferencesApi.list(),
      ReferencesApi.rules(),
    ]);
  }

  protected render(): void {
    const etalon = this.references.find((r) => r.isEtalon) ?? null;
    const withFile = this.references.filter((r) => r.hasFile).length;

    const byCategory = new Map<string, ReferenceImage[]>();
    for (const ref of this.references) {
      const list = byCategory.get(ref.category) ?? [];
      list.push(ref);
      byCategory.set(ref.category, list);
    }

    this.root.innerHTML = `
      ${screenHead(
        'Референсы',
        `${withFile} из ${this.references.length} с файлами. Эталон: ${
          etalon === null ? 'не отмечен' : escapeHtml(etalon.key)
        }${etalon?.soulId == null ? '' : ` · SoulId ${escapeHtml(etalon.soulId)}`}`,
        '<button class="btn-primary" id="makeSoul">Создать SoulId из эталона</button>'
      )}
      ${
        etalon !== null && !etalon.hasFile
          ? card(
              'Эталон без файла',
              '<p class="hint warn-text">Эталон отмечен, но файл не загружен — SoulId создать не из чего, ' +
                'и консистентности персонажа между кадрами не будет.</p>',
              'card-warn'
            )
          : ''
      }
      ${[...byCategory.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([cat, refs]) => card(cat, this.grid(refs)))
        .join('')}
      ${card(
        'Правила генерации',
        `${field('', linesArea('refRules', this.rules, 8), 'По строке на правило.')}
         <button class="btn-primary" id="saveRefRules">Сохранить</button>`
      )}`;
    this.bind();
  }

  private grid(refs: ReferenceImage[]): string {
    return `<div class="ref-grid">${refs
      .map(
        (r) => `
        <div class="ref-card ${r.isEtalon ? 'is-etalon' : ''}">
          <div class="ref-thumb">
            ${
              r.url === null
                ? '<span class="ref-empty">нет файла</span>'
                : `<img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.key)}" loading="lazy" />`
            }
          </div>
          <div class="ref-key">${escapeHtml(r.key)}</div>
          <div class="ref-meta">
            ${r.isEtalon ? badge('эталон', 'ok') : ''}
            ${r.bytes === null ? '' : `<span class="small">${escapeHtml(formatBytes(r.bytes))}</span>`}
          </div>
          <div class="ref-actions">
            <label class="btn-secondary btn-sm file-btn">
              Файл<input type="file" accept="image/*" data-upload="${escapeHtml(r.key)}" hidden />
            </label>
            ${
              r.isEtalon
                ? ''
                : `<button class="btn-secondary btn-sm" data-etalon="${escapeHtml(r.key)}">Эталон</button>`
            }
            ${
              r.hasFile
                ? `<button class="btn-danger btn-sm" data-del-file="${escapeHtml(r.key)}">×</button>`
                : ''
            }
          </div>
        </div>`
      )
      .join('')}</div>`;
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    // change, а не click: input[type=file] сообщает о выборе именно этим событием.
    this.root.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const key = target.dataset.upload;
      const file = target.files?.[0];
      if (key === undefined || file === undefined) return;
      void (async () => {
        try {
          await ReferencesApi.upload(key, file);
          toast.success(`Файл для «${key}» загружен`);
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      })();
    });

    onClick(this.root, '[data-etalon]', (btn) => {
      const key = btn.dataset.etalon ?? '';
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          await ReferencesApi.markEtalon(key);
          toast.success(`Эталон: ${key}`);
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-del-file]', (btn) => {
      const key = btn.dataset.delFile ?? '';
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          await ReferencesApi.removeFile(key);
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '#makeSoul', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          const updated = await ReferencesApi.createSoulId();
          toast.success(`SoulId создан: ${updated.soulId ?? ''}`);
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '#saveRefRules', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          await ReferencesApi.saveRules(readLines(this.root, 'refRules'));
          toast.success('Правила сохранены');
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });
  }
}
