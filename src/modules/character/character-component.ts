import { CharacterApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, query, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { formatDateTime } from '../../ui/format.js';
import {
  BaseScreen,
  card,
  field,
  jsonArea,
  linesArea,
  numberInput,
  readJson,
  readLines,
  readNumber,
  readValue,
  screenHead,
  table,
  textInput,
  dateInput,
} from '../../ui/screen.js';
import type { Character, CharacterRevision } from '../../types/engine.js';

/**
 * Персонаж. Каждое сохранение поднимает версию и пишет ревизию: блок персонажа уходит в
 * кешируемую часть промпта, и без истории не восстановить, почему модель заговорила иначе.
 */
export class CharacterComponent extends BaseScreen {
  private character: Character | null = null;
  private revisions: CharacterRevision[] = [];
  private bound = false;

  protected async load(): Promise<void> {
    this.character = await CharacterApi.get();
    this.revisions = await CharacterApi.revisions();
  }

  protected render(): void {
    const c = this.character;
    if (c === null) return;

    this.root.innerHTML = `
      ${screenHead(
        'Персонаж',
        `Версия ${c.version}, обновлён ${escapeHtml(formatDateTime(c.updatedAt))}. Профиль уходит в кешируемый блок промпта.`,
        '<button class="btn-primary" id="saveCharacter">Сохранить</button>'
      )}
      ${card(
        'Профиль',
        `<div class="grid-2">
          ${field('Имя', textInput('name', c.name))}
          ${field('Хендл', textInput('handle', c.handle))}
          ${field('Возраст', numberInput('age', c.age))}
          ${field('День рождения', dateInput('birthday', c.birthday))}
          ${field('Город', textInput('city', c.city))}
          ${field('Родной город', textInput('hometown', c.hometown))}
        </div>
        ${field('Где живёт', textInput('home', c.home))}
        ${field('Мечта', textInput('dream', c.dream))}`
      )}
      ${card(
        'Список «никогда»',
        field(
          '',
          linesArea('never', c.never, 10),
          'По строке на правило. Уходит в системный промпт и в фильтр — это ограничения, а не пожелания.'
        )
      )}
      ${card(
        'Константы-фишки',
        field('', linesArea('constants', c.constants, 6), 'По строке на константу.')
      )}
      ${card(
        'Учёба, психология, голос',
        `${field('Учёба (JSON)', jsonArea('study', c.study, 5))}
         ${field('Психология (JSON)', jsonArea('psychology', c.psychology, 12))}
         ${field('Тон речи (JSON)', jsonArea('toneOfVoice', c.toneOfVoice, 8))}`
      )}
      ${card(
        'Раскрытие ИИ, окружение, длинные линии',
        `${field('Раскрытие ИИ (JSON)', jsonArea('aiDisclosure', c.aiDisclosure, 8))}
         ${field('Окружение (JSON)', jsonArea('environment', c.environment, 10))}
         ${field('Секреты и длинные арки (JSON)', jsonArea('secretsLongArcs', c.secretsLongArcs, 8))}`
      )}
      ${card('Заметка к правке', field('', textInput('note', ''), 'Попадёт в историю версий.'))}
      ${card('История версий', this.revisionsTable())}`;

    this.bind();
  }

  private revisionsTable(): string {
    return table(
      ['Версия', 'Заметка', 'Когда'],
      this.revisions.map(
        (r) =>
          `<tr><td>${r.version}</td><td>${escapeHtml(r.note ?? '—')}</td>
             <td>${escapeHtml(formatDateTime(r.createdAt))}</td></tr>`
      )
    );
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;
    onClick(this.root, '#saveCharacter', (btn) => {
      void withBusy(btn as HTMLButtonElement, () => this.save());
    });
  }

  private async save(): Promise<void> {
    try {
      const payload = {
        name: readValue(this.root, 'name'),
        handle: readValue(this.root, 'handle'),
        age: readNumber(this.root, 'age') ?? 19,
        birthday: readValue(this.root, 'birthday'),
        city: readValue(this.root, 'city'),
        hometown: readValue(this.root, 'hometown'),
        home: readValue(this.root, 'home'),
        dream: readValue(this.root, 'dream'),
        study: readJson(this.root, 'study'),
        aiDisclosure: readJson(this.root, 'aiDisclosure'),
        psychology: readJson(this.root, 'psychology'),
        toneOfVoice: readJson(this.root, 'toneOfVoice'),
        never: readLines(this.root, 'never'),
        constants: readLines(this.root, 'constants'),
        environment: readJson(this.root, 'environment'),
        secretsLongArcs: readJson(this.root, 'secretsLongArcs'),
        note: readValue(this.root, 'note'),
      };
      await CharacterApi.update(payload);
      toast.success('Персонаж сохранён, версия поднята');
      const scroll = query<HTMLElement>(document, '#main')?.scrollTop ?? 0;
      await this.reload();
      const main = query<HTMLElement>(document, '#main');
      if (main !== null) main.scrollTop = scroll;
    } catch (e: unknown) {
      toast.error(errorText(e));
    }
  }
}
