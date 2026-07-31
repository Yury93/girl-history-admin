import { ModesApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import {
  BaseScreen,
  card,
  emptyBox,
  field,
  linesArea,
  readLines,
  readValue,
  screenHead,
  table,
} from '../../ui/screen.js';
import type { CalendarEvent, Mode } from '../../types/engine.js';

/**
 * Режимы, календарь и правила реализма.
 *
 * Режимы покрывают НЕ весь год: на дату без режима генерация отвечает ошибкой ещё до
 * постановки прогона. Поэтому здесь показан суммарный охват — дыры видно сразу.
 */
export class ModesComponent extends BaseScreen {
  private modes: Mode[] = [];
  private events: CalendarEvent[] = [];
  private rules: string[] = [];
  private bound = false;

  protected async load(): Promise<void> {
    [this.modes, this.events, this.rules] = await Promise.all([
      ModesApi.list(),
      ModesApi.events(),
      ModesApi.realismRules(),
    ]);
  }

  protected render(): void {
    this.root.innerHTML = `
      ${screenHead(
        'Режимы и календарь',
        'Режим определяет сетку недели и время слотов. Для даты без режима генерация вернёт ошибку.',
        '<button class="btn-secondary" id="addMode">+ Режим</button>',
        'modes'
      )}
      ${card('Сезонные режимы', this.modesTable(), '', 'mode', 'modes-list')}
      ${card(
        'Календарные события',
        `${this.eventsTable()}
         <div class="inline-form">
           <input type="date" data-name="evDate" />
           <input type="text" data-name="evTitle" placeholder="Название" />
           <select data-name="evType">
             <option value="arc">arc</option>
             <option value="holiday">holiday</option>
             <option value="other">other</option>
           </select>
           <button class="btn-secondary" id="addEvent">Добавить</button>
         </div>
         <p class="hint">События типа <code>arc</code> месячный планировщик обходит стороной:
            эпизоды не должны падать на арочные даты.</p>`
      )}
      ${card(
        'Правила реализма',
        `${field('', linesArea('rules', this.rules, 8), 'По строке на правило. Уходят в промпт как есть.')}
         <button class="btn-primary" id="saveRules">Сохранить правила</button>`
      )}`;
    this.bind();
  }

  private modesTable(): string {
    if (this.modes.length === 0) return emptyBox('Режимов нет — выполните импорт справочников');
    return table(
      ['Ключ', 'Название', 'Период', 'Утро', 'Слоты', ''],
      this.modes.map(
        (m) => `<tr>
          <td><code>${escapeHtml(m.key)}</code></td>
          <td>${escapeHtml(m.title)}</td>
          <td>${escapeHtml(m.dateFrom)} — ${escapeHtml(m.dateTo)}</td>
          <td>${escapeHtml(m.morningSlotStart)}</td>
          <td class="mono small">${escapeHtml(
            `${m.slotTimes.day} / ${m.slotTimes.evening} / ${m.slotTimes.night}`
          )}</td>
          <td><button class="btn-danger btn-sm" data-del-mode="${escapeHtml(m.key)}">Удалить</button></td>
        </tr>`
      )
    );
  }

  private eventsTable(): string {
    return table(
      ['Дата', 'Название', 'Тип', ''],
      this.events.map(
        (e) => `<tr>
          <td>${escapeHtml(e.dateFrom)}${e.dateTo === null ? '' : ` — ${escapeHtml(e.dateTo)}`}</td>
          <td>${escapeHtml(e.title)}</td>
          <td>${escapeHtml(e.type)}</td>
          <td><button class="btn-danger btn-sm" data-del-event="${e.id}">Удалить</button></td>
        </tr>`
      )
    );
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '#saveRules', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          await ModesApi.saveRealismRules(readLines(this.root, 'rules'));
          toast.success('Правила сохранены');
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '#addEvent', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        const dateFrom = readValue(this.root, 'evDate');
        const title = readValue(this.root, 'evTitle');
        if (dateFrom === '' || title === '') {
          toast.warn('Укажите дату и название');
          return;
        }
        try {
          await ModesApi.createEvent({ dateFrom, title, type: readValue(this.root, 'evType') });
          toast.success('Событие добавлено');
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-del-event]', (btn) => {
      const id = Number(btn.dataset.delEvent);
      void (async () => {
        try {
          await ModesApi.removeEvent(id);
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      })();
    });

    onClick(this.root, '[data-del-mode]', (btn) => {
      const key = btn.dataset.delMode ?? '';
      void (async () => {
        // Удаление режима каскадом уносит его сетку недели — предупреждаем прямо.
        const ok = await confirmDialog({
          title: `Удалить режим «${key}»?`,
          message:
            'Вместе с режимом каскадом удалится его сетка недели целиком. Сервер сначала ' +
            'ответит 409 со списком того, что уедет; подтверждение здесь означает force.',
          danger: true,
          confirmLabel: 'Удалить вместе с сеткой',
          requirePhrase: key,
        });
        if (!ok) return;
        try {
          await ModesApi.remove(key, true);
          toast.success('Режим удалён');
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      })();
    });

    onClick(this.root, '#addMode', () => {
      toast.info(
        'Новый режим заводится через API: POST /engine/modes. В сетке недели после этого ' +
          'нужно заполнить 7 дней, иначе генерация по этому режиму вернёт ошибку.'
      );
    });
  }
}
