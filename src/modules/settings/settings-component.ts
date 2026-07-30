import { SeedApi, SettingsApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import {
  BaseScreen,
  badge,
  card,
  field,
  jsonArea,
  readJson,
  screenHead,
  table,
} from '../../ui/screen.js';
import type { EngineSettings, ImportReport, PromptTemplate, Rubric } from '../../types/engine.js';

/**
 * Настройки движка, шаблоны промптов и импорт справочников.
 *
 * Импорт — ЯВНАЯ операция, а не шаг старта: `pm2 restart` происходит при каждом деплое, и
 * импорт на старте затирал бы всю ручную правку пулов и луков.
 */
export class SettingsComponent extends BaseScreen {
  private settings: EngineSettings | null = null;
  private templates: PromptTemplate[] = [];
  private rubrics: Rubric[] = [];
  private report: ImportReport | null = null;
  private openTemplate: string | null = null;
  private bound = false;

  protected async load(): Promise<void> {
    [this.settings, this.templates, this.rubrics] = await Promise.all([
      SettingsApi.get(),
      SettingsApi.templates(),
      SettingsApi.rubrics(),
    ]);
  }

  protected render(): void {
    const s = this.settings;
    if (s === null) return;

    this.root.innerHTML = `
      ${screenHead(
        'Настройки движка',
        'Правила постинга, сцены, причёски и фильтр «никогда». Ссылки на рубрики и локации проверяются при сохранении.',
        '<button class="btn-primary" id="saveSettings">Сохранить настройки</button>'
      )}
      ${card(
        'Импорт справочников',
        `<p class="hint">Режим <code>missing</code> не трогает существующие записи.
           <code>overwrite</code> перезаписывает поля значениями из сида — ручная правка
           этих полей будет потеряна.</p>
         <div class="inline-form">
           <button class="btn-secondary" id="importMissing">Импорт (missing)</button>
           <button class="btn-danger" id="importOverwrite">Переимпорт (overwrite)</button>
         </div>
         ${this.reportView()}`
      )}
      ${card(
        'Правила постинга',
        field(
          '',
          jsonArea('postingRules', s.postingRules, 16),
          'arcWeekdays — дни, в которые играется арка. arcLocation заменяет локацию арочного слота: ' +
            'без этого арочные биты уезжают в спортзал.'
        )
      )}
      ${card('Модули сцены', field('', jsonArea('sceneTypeRules', s.sceneTypeRules, 10)))}
      ${card(
        'Причёски и отклонения',
        `${field('Причёски', jsonArea('hairSignalRules', s.hairSignalRules, 6))}
         ${field('Доли отклонений', jsonArea('deviationRatio', s.deviationRatio, 6))}
         ${field('Константы дня', jsonArea('dailyBase', s.dailyBase, 6))}`
      )}
      ${card(
        'Фильтр «никогда»',
        field(
          '',
          jsonArea('contentFilter', s.contentFilter, 12),
          'Регэкспы проверяются на компилируемость при сохранении. Фильтр не блокирует пост, ' +
            'но одобрение помеченного требует подтверждения.'
        )
      )}
      ${card('Параметры изображений', field('', jsonArea('imageDefaults', s.imageDefaults, 8)))}
      ${card('Рубрики', this.rubricsTable())}
      ${card('Шаблоны промптов', this.templatesList())}`;
    this.bind();
  }

  private reportView(): string {
    const r = this.report;
    if (r === null) return '';
    const counts = Object.entries(r.created)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `
      <div class="import-report">
        <p><b>Создано:</b> ${escapeHtml(counts === '' ? 'ничего (всё уже было)' : counts)}</p>
        ${r.warnings.map((w) => `<p class="warn-text">${escapeHtml(w)}</p>`).join('')}
        <p><b>Дефекты данных (${r.defects.length}):</b> это не ошибки импорта — расхождения
           в самих справочниках, о которых движок сообщает, а не маскирует.</p>
        ${table(
          ['Код', 'Подробности'],
          r.defects.map(
            (d) =>
              `<tr><td>${badge(d.code, 'warn')}</td><td class="small">${escapeHtml(d.detail)}</td></tr>`
          )
        )}
      </div>`;
  }

  private rubricsTable(): string {
    return table(
      ['Ключ', 'Название', 'Площадки', 'Доля'],
      this.rubrics.map(
        (r) => `<tr>
          <td><code>${escapeHtml(r.key)}</code></td>
          <td>${escapeHtml(r.title)}</td>
          <td>${r.platforms.map((p) => badge(p)).join(' ')}</td>
          <td class="small">${escapeHtml(r.share ?? '—')}</td>
        </tr>`
      )
    );
  }

  private templatesList(): string {
    return this.templates
      .map(
        (t) => `
        <div class="template-row">
          <div class="template-head" data-tpl="${escapeHtml(t.key)}">
            <code>${escapeHtml(t.key)}</code>
            <span class="small">${escapeHtml(t.title)}</span>
          </div>
          ${
            this.openTemplate === t.key
              ? `<textarea class="mono" data-tpl-body="${escapeHtml(t.key)}" rows="8">${escapeHtml(t.body)}</textarea>
                 <button class="btn-secondary btn-sm" data-save-tpl="${escapeHtml(t.key)}">Сохранить шаблон</button>`
              : ''
          }
        </div>`
      )
      .join('');
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '#importMissing', (btn) => {
      void withBusy(btn as HTMLButtonElement, () => this.runImport('missing'));
    });

    onClick(this.root, '#importOverwrite', (btn) => {
      void (async () => {
        const ok = await confirmDialog({
          title: 'Переимпорт с перезаписью?',
          message:
            'Поля справочников будут перезаписаны значениями из сида — ручная правка этих ' +
            'полей потеряется. Реестр вариаций и посты не затрагиваются.',
          danger: true,
          confirmLabel: 'Перезаписать',
          requirePhrase: 'overwrite',
        });
        if (!ok) return;
        await withBusy(btn as HTMLButtonElement, () => this.runImport('overwrite'));
      })();
    });

    onClick(this.root, '#saveSettings', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          const payload = {
            postingRules: readJson(this.root, 'postingRules'),
            sceneTypeRules: readJson(this.root, 'sceneTypeRules'),
            hairSignalRules: readJson(this.root, 'hairSignalRules'),
            deviationRatio: readJson(this.root, 'deviationRatio'),
            dailyBase: readJson(this.root, 'dailyBase'),
            contentFilter: readJson(this.root, 'contentFilter'),
            imageDefaults: readJson(this.root, 'imageDefaults'),
          } as Partial<EngineSettings>;
          this.settings = await SettingsApi.update(payload);
          toast.success('Настройки сохранены');
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-tpl]', (el) => {
      const key = el.dataset.tpl ?? '';
      this.openTemplate = this.openTemplate === key ? null : key;
      this.render();
    });

    onClick(this.root, '[data-save-tpl]', (btn) => {
      const key = btn.dataset.saveTpl ?? '';
      void withBusy(btn as HTMLButtonElement, async () => {
        const body =
          this.root.querySelector<HTMLTextAreaElement>(`[data-tpl-body="${key}"]`)?.value ?? '';
        try {
          await SettingsApi.saveTemplate(key, body);
          toast.success('Шаблон сохранён');
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });
  }

  private async runImport(mode: 'missing' | 'overwrite'): Promise<void> {
    try {
      this.report = await SeedApi.import(mode);
      toast.success(`Импорт завершён, дефектов данных: ${this.report.defects.length}`);
      this.invalidate();
      await this.reload();
    } catch (e: unknown) {
      toast.error(errorText(e));
    }
  }
}
