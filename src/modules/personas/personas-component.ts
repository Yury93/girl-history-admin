import { PersonaApi } from '../../api/persona-api.js';
import { errorText } from '../../api/http.js';
import { store } from '../../state/app-state.js';
import { escapeHtml, onClick, query, requireElement, withBusy } from '../../ui/dom.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { initial, pluralWithCount } from '../../ui/format.js';
import {
  ACCEPTED_IMAGE_MIME,
  PERSONA_NAME_MAX,
  PERSONA_PROMPT_MAX,
  PERSONA_PROMPT_MIN,
  UPLOAD_BYTES_MAX,
} from '../../types/limits.js';
import { formatBytes } from '../../ui/format.js';

/**
 * Сайдбар: список профилей персонажей и создание нового.
 *
 * Живёт вне системы вкладок — виден всегда, потому что выбор профиля определяет,
 * что показывают вкладки.
 */
export class PersonasComponent {
  private readonly list: HTMLElement;
  private readonly counter: HTMLElement;

  constructor() {
    this.list = requireElement('personasList');
    this.counter = requireElement('profilesCount');

    query<HTMLButtonElement>(document, '#btnNewPersona')?.addEventListener('click', () => {
      void this.openCreateForm();
    });

    // Делегирование: список перерисовывается целиком, и переподписываться не нужно.
    onClick(this.list, '[data-owner-token]', (el) => {
      const token = el.dataset.ownerToken;
      if (token !== undefined) void this.selectPersona(token);
    });

    store.subscribe(() => {
      this.render();
    });
  }

  async activate(): Promise<void> {
    try {
      await store.init();
    } catch (error) {
      toast.error(`Не удалось загрузить профили: ${errorText(error)}`);
      this.renderError();
    }
  }

  private async selectPersona(ownerToken: string): Promise<void> {
    try {
      await store.select(ownerToken);
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  private render(): void {
    const items = store.list;
    const selected = store.persona?.ownerToken ?? null;

    this.counter.textContent = items.length === 0 ? '' : String(items.length);

    if (!store.isListLoaded) {
      this.list.innerHTML = '<div class="empty small"><div class="desc">Загрузка…</div></div>';
      return;
    }

    if (items.length === 0) {
      this.list.innerHTML = `
        <div class="empty small">
          <div class="icon">👤</div>
          <div class="desc">Профилей пока нет.<br>Создайте первый — это займёт минуту.</div>
        </div>`;
      return;
    }

    this.list.innerHTML = items
      .map((item) => {
        const avatar =
          item.photoUrl === null
            ? `<div class="profile-avatar placeholder">${escapeHtml(initial(item.name))}</div>`
            : `<img class="profile-avatar" src="${escapeHtml(item.photoUrl)}" alt="">`;
        const chronicles =
          item.chroniclesCount === 0
            ? 'нет хроник'
            : pluralWithCount(item.chroniclesCount, 'хроника', 'хроники', 'хроник');

        return `
          <div class="profile-item${item.ownerToken === selected ? ' selected' : ''}"
               data-owner-token="${escapeHtml(item.ownerToken)}">
            ${avatar}
            <div class="profile-meta">
              <div class="profile-name">${escapeHtml(item.name)}</div>
              <div class="profile-sub">${escapeHtml(chronicles)}</div>
            </div>
          </div>`;
      })
      .join('');
  }

  private renderError(): void {
    this.list.innerHTML = `
      <div class="empty small">
        <div class="icon">⚠️</div>
        <div class="desc">Не удалось загрузить список.<br>
        Проверьте, что бэкенд доступен по адресу прокси.</div>
      </div>`;
  }

  /** Форма создания профиля — в модалке, чтобы не занимать вкладку. */
  private openCreateForm(): void {
    const root = document.getElementById('modal-root');
    if (root === null) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="max-width: 560px;">
        <h3>Новый профиль персонажа</h3>
        <p>Хроника строится из промпта. Фотографии, которые должны на неё влиять,
           добавляются отдельно — на вкладке «Референсы».</p>

        <div class="field">
          <label>Имя <span class="counter" id="nameCounter"></span></label>
          <input type="text" id="newName" maxlength="${PERSONA_NAME_MAX}"
                 placeholder="Например: Аня" autocomplete="off" />
        </div>

        <div class="field">
          <label>Промпт — кто она <span class="counter" id="promptCounter"></span></label>
          <textarea id="newPrompt" rows="7"
            placeholder="Кто она, где живёт, чем занимается, что для неё важно. Чем подробнее, тем связнее выйдет лента."></textarea>
          <div class="hint">Минимум ${PERSONA_PROMPT_MIN} символов. Персонаж произвольный —
            генератор не привязан ни к какому конкретному миру.</div>
        </div>

        <div class="field">
          <label>Аватар — необязательно</label>
          <input type="file" id="newPhoto" accept="${ACCEPTED_IMAGE_MIME}" />
          <div class="hint">Только оформление: в генерации <b>не участвует</b> и в LLM не отправляется.
            До ${formatBytes(UPLOAD_BYTES_MAX)}.</div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="createCancel">Отмена</button>
          <button class="btn-primary" id="createOk">Создать</button>
        </div>
      </div>`;

    const nameInput = backdrop.querySelector<HTMLInputElement>('#newName');
    const promptInput = backdrop.querySelector<HTMLTextAreaElement>('#newPrompt');
    const photoInput = backdrop.querySelector<HTMLInputElement>('#newPhoto');
    const okBtn = backdrop.querySelector<HTMLButtonElement>('#createOk');
    const nameCounter = backdrop.querySelector<HTMLElement>('#nameCounter');
    const promptCounter = backdrop.querySelector<HTMLElement>('#promptCounter');

    const close = (): void => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };

    const refresh = (): void => {
      const name = nameInput?.value.trim() ?? '';
      const prompt = promptInput?.value.trim() ?? '';
      if (nameCounter !== null) nameCounter.textContent = `${name.length} / ${PERSONA_NAME_MAX}`;
      if (promptCounter !== null) {
        promptCounter.textContent = `${prompt.length} / ${PERSONA_PROMPT_MAX}`;
        promptCounter.classList.toggle('over', prompt.length > PERSONA_PROMPT_MAX);
      }
      // Валидируем на клиенте по границам бэкенда, чтобы не ловить 400 после отправки.
      if (okBtn !== null) {
        okBtn.disabled =
          name === '' ||
          name.length > PERSONA_NAME_MAX ||
          prompt.length < PERSONA_PROMPT_MIN ||
          prompt.length > PERSONA_PROMPT_MAX;
      }
    };

    nameInput?.addEventListener('input', refresh);
    promptInput?.addEventListener('input', refresh);
    refresh();

    backdrop.querySelector('#createCancel')?.addEventListener('click', close);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);

    okBtn?.addEventListener('click', () => {
      const photo = photoInput?.files?.[0] ?? null;
      // Размер проверяем до отправки: иначе получим 413 после долгой заливки.
      if (photo !== null && photo.size > UPLOAD_BYTES_MAX) {
        toast.error(
          `Файл ${formatBytes(photo.size)} — больше предела ${formatBytes(UPLOAD_BYTES_MAX)}.`
        );
        return;
      }

      void withBusy(okBtn, async () => {
        try {
          const created = await PersonaApi.create({
            name: nameInput?.value.trim() ?? '',
            sourcePrompt: promptInput?.value.trim() ?? '',
            photo,
          });
          close();
          await store.loadList();
          store.applyPersona(created);
          toast.success(`Профиль «${created.name}» создан.`);
        } catch (error) {
          toast.error(errorText(error));
        }
      });
    });

    root.appendChild(backdrop);
    nameInput?.focus();
  }
}

/** Удаление профиля живёт здесь же: подтверждение одинаковое, откуда бы ни звали. */
export async function deletePersonaWithConfirm(name: string, ownerToken: string): Promise<boolean> {
  const confirmed = await confirmDialog({
    title: 'Удалить профиль?',
    message:
      `Профиль «${name}» будет удалён вместе со ВСЕМИ его хрониками, днями, ` +
      'референсами и файлами. Действие необратимо, публичные ссылки на хроники перестанут работать.',
    confirmLabel: 'Удалить навсегда',
    danger: true,
    requirePhrase: name,
  });
  if (!confirmed) return false;

  try {
    await PersonaApi.remove(ownerToken);
    store.clearSelection();
    await store.loadList();
    toast.success('Профиль удалён.');
    return true;
  } catch (error) {
    toast.error(errorText(error));
    return false;
  }
}
