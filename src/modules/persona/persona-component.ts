import { PersonaApi } from '../../api/persona-api.js';
import { errorText } from '../../api/http.js';
import { store } from '../../state/app-state.js';
import { escapeHtml, query, requireElement, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { formatBytes, formatDateTime, initial } from '../../ui/format.js';
import { deletePersonaWithConfirm } from '../personas/personas-component.js';
import {
  ACCEPTED_IMAGE_MIME,
  PERSONA_APPEARANCE_MAX,
  PERSONA_NAME_MAX,
  PERSONA_PROMPT_MAX,
  PERSONA_PROMPT_MIN,
  UPLOAD_BYTES_MAX,
} from '../../types/limits.js';
import type { TabComponent } from '../../types/tab.js';

/** Вкладка «Профиль»: промпт, внешность, аватар, ключ правки, удаление. */
export class PersonaComponent implements TabComponent {
  private readonly container: HTMLElement;
  /** Файл, выбранный, но ещё не отправленный. */
  private pendingPhoto: File | null = null;

  constructor(containerId: string) {
    this.container = requireElement(containerId);
    store.subscribe(() => {
      // Перерисовываем только когда вкладка на экране: иначе затрём несохранённый ввод.
      if (this.container.classList.contains('active')) this.render();
    });
  }

  activate(): Promise<void> {
    this.render();
    return Promise.resolve();
  }

  private render(): void {
    const persona = store.persona;
    if (persona === null) {
      this.container.innerHTML = `
        <div class="empty">
          <div class="icon">👈</div>
          <div class="title">Профиль не выбран</div>
          <div class="desc">Выберите профиль в списке слева или создайте новый.</div>
        </div>`;
      return;
    }

    this.pendingPhoto = null;
    const avatar =
      persona.photoUrl === null
        ? `<div class="profile-avatar placeholder" style="width:72px;height:72px;font-size:26px;">${escapeHtml(initial(persona.name))}</div>`
        : `<img class="profile-avatar" style="width:72px;height:72px;" src="${escapeHtml(persona.photoUrl)}" alt="">`;

    const withDescription = persona.images.filter(
      (img) => img.description !== null && img.description.trim() !== ''
    ).length;
    const referenceNote =
      persona.images.length === 0
        ? 'Референсов нет — хроники строятся по одному промпту.'
        : `Референсов: ${persona.images.length}, из них учитываются в промпте: ${withDescription}.`;

    this.container.innerHTML = `
      <div class="panel-head">
        <h2>${escapeHtml(persona.name)}</h2>
        <button class="btn-secondary" id="btnReload">Обновить</button>
        <button class="btn-primary" id="btnSave">Сохранить</button>
      </div>
      <div class="panel-sub">Создан ${escapeHtml(formatDateTime(persona.createdAt))}. ${escapeHtml(referenceNote)}</div>

      <div class="card">
        <div class="row" style="align-items: flex-start; gap: 18px;">
          <div style="text-align:center;">
            ${avatar}
            <div style="margin-top:8px;">
              <input type="file" id="photoInput" accept="${ACCEPTED_IMAGE_MIME}" style="display:none;" />
              <button class="btn-ghost btn-sm" id="btnPickPhoto">Заменить</button>
            </div>
            <div class="dim" id="photoNote" style="font-size:11px;margin-top:4px;"></div>
          </div>
          <div style="flex:1;min-width:0;">
            <div class="field">
              <label>Имя <span class="counter" id="nameCounter"></span></label>
              <input type="text" id="fName" maxlength="${PERSONA_NAME_MAX}"
                     value="${escapeHtml(persona.name)}" />
            </div>
            <div class="dim" style="font-size:12px;">
              Аватар — только оформление: в LLM не отправляется и на текст не влияет.
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="field" style="margin-bottom:0;">
          <label>Промпт — основа генерации <span class="counter" id="promptCounter"></span></label>
          <textarea id="fPrompt" rows="12">${escapeHtml(persona.sourcePrompt)}</textarea>
          <div class="hint">Единственный источник, из которого строится хроника (плюс описания
            референсов, если они есть). Правка промпта не перегенерирует уже готовые хроники —
            они лишь помечаются как устаревшие.</div>
        </div>
      </div>

      <div class="card">
        <div class="field" style="margin-bottom:0;">
          <label>Внешность — необязательно <span class="counter" id="appearanceCounter"></span></label>
          <textarea id="fAppearance" rows="4">${escapeHtml(persona.appearance ?? '')}</textarea>
          <div class="hint">Заполняется только руками: из аватара это описание
            <b>не выводится</b>. Если не пусто — добавляется в промпт отдельной строкой.</div>
        </div>
      </div>

      <div class="card">
        <div class="field" style="margin-bottom:0;">
          <label>Ключ правки (ownerToken)</label>
          <div class="row">
            <input type="text" class="mono" id="fToken" readonly
                   value="${escapeHtml(persona.ownerToken)}" />
            <button class="btn-secondary" id="btnCopyToken">Копировать</button>
          </div>
          <div class="hint">Это <b>не ссылка для передачи</b>, а право менять и удалять профиль.
            Делятся публичной ссылкой на конкретную хронику — она на вкладке «Хроники».</div>
        </div>
      </div>

      <div class="divider"></div>
      <div class="row">
        <div class="dim" style="font-size:12px;flex:1;">
          Удаление снесёт профиль вместе со всеми хрониками, днями и файлами.
        </div>
        <button class="btn-danger" id="btnDelete">Удалить профиль</button>
      </div>`;

    this.bind(persona.name, persona.ownerToken);
    this.updateCounters();
  }

  private bind(name: string, ownerToken: string): void {
    const root = this.container;

    query<HTMLInputElement>(root, '#fName')?.addEventListener('input', () => {
      this.updateCounters();
    });
    query<HTMLTextAreaElement>(root, '#fPrompt')?.addEventListener('input', () => {
      this.updateCounters();
    });
    query<HTMLTextAreaElement>(root, '#fAppearance')?.addEventListener('input', () => {
      this.updateCounters();
    });

    const photoInput = query<HTMLInputElement>(root, '#photoInput');
    query<HTMLButtonElement>(root, '#btnPickPhoto')?.addEventListener('click', () => {
      photoInput?.click();
    });
    photoInput?.addEventListener('change', () => {
      const file = photoInput.files?.[0] ?? null;
      const note = query<HTMLElement>(root, '#photoNote');
      if (file !== null && file.size > UPLOAD_BYTES_MAX) {
        toast.error(`Файл ${formatBytes(file.size)} — предел ${formatBytes(UPLOAD_BYTES_MAX)}.`);
        photoInput.value = '';
        this.pendingPhoto = null;
        if (note !== null) note.textContent = '';
        return;
      }
      this.pendingPhoto = file;
      if (note !== null) note.textContent = file === null ? '' : 'будет заменён при сохранении';
    });

    query<HTMLButtonElement>(root, '#btnCopyToken')?.addEventListener('click', () => {
      void navigator.clipboard.writeText(ownerToken).then(
        () => {
          toast.success('Ключ правки скопирован.');
        },
        () => {
          toast.warn('Не удалось скопировать — выделите поле вручную.');
        }
      );
    });

    query<HTMLButtonElement>(root, '#btnReload')?.addEventListener('click', () => {
      void store.reload().catch((error: unknown) => {
        toast.error(errorText(error));
      });
    });

    const saveBtn = query<HTMLButtonElement>(root, '#btnSave');
    saveBtn?.addEventListener('click', () => {
      void withBusy(saveBtn, () => this.save());
    });

    query<HTMLButtonElement>(root, '#btnDelete')?.addEventListener('click', () => {
      void deletePersonaWithConfirm(name, ownerToken);
    });
  }

  private updateCounters(): void {
    const root = this.container;
    const pairs: [string, string, number][] = [
      ['#fName', '#nameCounter', PERSONA_NAME_MAX],
      ['#fPrompt', '#promptCounter', PERSONA_PROMPT_MAX],
      ['#fAppearance', '#appearanceCounter', PERSONA_APPEARANCE_MAX],
    ];
    for (const [fieldSel, counterSel, max] of pairs) {
      const field = query<HTMLInputElement | HTMLTextAreaElement>(root, fieldSel);
      const counter = query<HTMLElement>(root, counterSel);
      if (field === null || counter === null) continue;
      const length = field.value.trim().length;
      counter.textContent = `${length} / ${max}`;
      counter.classList.toggle('over', length > max);
    }
  }

  /**
   * Отправляем ТОЛЬКО изменённые поля. Пустое тело без файла бэкенд отвергает с 400
   * «Нечего обновлять» (persona-controller.ts:63-65), да и гонять весь профиль незачем.
   */
  private async save(): Promise<void> {
    const persona = store.persona;
    if (persona === null) return;
    const root = this.container;

    const name = query<HTMLInputElement>(root, '#fName')?.value.trim() ?? '';
    const prompt = query<HTMLTextAreaElement>(root, '#fPrompt')?.value.trim() ?? '';
    const appearanceRaw = query<HTMLTextAreaElement>(root, '#fAppearance')?.value.trim() ?? '';
    const appearance = appearanceRaw === '' ? null : appearanceRaw;

    if (name === '' || name.length > PERSONA_NAME_MAX) {
      toast.error(`Имя обязательно и не длиннее ${PERSONA_NAME_MAX} символов.`);
      return;
    }
    if (prompt.length < PERSONA_PROMPT_MIN || prompt.length > PERSONA_PROMPT_MAX) {
      toast.error(`Промпт: от ${PERSONA_PROMPT_MIN} до ${PERSONA_PROMPT_MAX} символов.`);
      return;
    }
    if (appearanceRaw.length > PERSONA_APPEARANCE_MAX) {
      toast.error(`Описание внешности длиннее ${PERSONA_APPEARANCE_MAX} символов.`);
      return;
    }

    const patch: Parameters<typeof PersonaApi.update>[1] = {};
    if (name !== persona.name) patch.name = name;
    if (prompt !== persona.sourcePrompt) patch.sourcePrompt = prompt;
    if (appearance !== persona.appearance) patch.appearance = appearance;
    if (this.pendingPhoto !== null) patch.photo = this.pendingPhoto;

    if (Object.keys(patch).length === 0) {
      toast.info('Изменений нет.');
      return;
    }

    try {
      // Ответ PATCH — уже полный профиль с новым photoUrl (имя файла новое, поэтому
      // недельный immutable-кеш старого аватара нам не помешает).
      const updated = await PersonaApi.update(persona.ownerToken, patch);
      store.applyPersona(updated);
      await store.loadList();
      toast.success('Профиль сохранён.');
    } catch (error) {
      toast.error(errorText(error));
    }
  }
}
