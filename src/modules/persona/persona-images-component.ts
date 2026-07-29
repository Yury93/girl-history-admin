import { PersonaImageApi } from '../../api/persona-image-api.js';
import { errorText } from '../../api/http.js';
import { store } from '../../state/app-state.js';
import { escapeHtml, onClick, query, requireElement, withBusy } from '../../ui/dom.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { formatBytes, pluralWithCount } from '../../ui/format.js';
import { ACCEPTED_IMAGE_MIME, PERSONA_IMAGES_MAX, UPLOAD_BYTES_MAX } from '../../types/limits.js';
import type { PersonaImage } from '../../types/persona.js';
import type { TabComponent } from '../../types/tab.js';

/**
 * Вкладка «Референсы» — фотографии, которые ВЛИЯЮТ на генерацию.
 *
 * Это и есть режим «список фото + промпт»: есть референсы с описаниями — они уходят в промпт
 * всех хроник профиля; нет — хроника строится по одному промпту. Отдельного переключателя
 * не нужно, выбор делается самим наличием картинок.
 *
 * Главная ловушка, которую обязан показывать интерфейс: при сбое vision картинка сохраняется
 * с пустым описанием и в промпт НЕ попадает (prompt-builder.ts:48-50). Пользователь при этом
 * видит загруженное фото и уверен, что оно учтено.
 */
export class PersonaImagesComponent implements TabComponent {
  private readonly container: HTMLElement;
  private uploading = false;

  constructor(containerId: string) {
    this.container = requireElement(containerId);
    store.subscribe(() => {
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
          <div class="desc">Референсы привязаны к профилю персонажа — сначала выберите его.</div>
        </div>`;
      return;
    }

    const images = persona.images;
    const counted = images.filter(
      (img) => img.description !== null && img.description.trim() !== ''
    ).length;
    const slotsLeft = PERSONA_IMAGES_MAX - images.length;

    this.container.innerHTML = `
      <div class="panel-head">
        <h2>Референсы</h2>
        <span class="badge ${counted > 0 ? 'badge-done' : 'badge-neutral'}">
          ${images.length} / ${PERSONA_IMAGES_MAX}, учитывается ${counted}
        </span>
        <div class="spacer"></div>
        <input type="file" id="imgInput" multiple accept="${ACCEPTED_IMAGE_MIME}" style="display:none;" />
        <button class="btn-primary" id="btnUpload" ${slotsLeft <= 0 ? 'disabled' : ''}>
          Добавить фото
        </button>
      </div>

      <div class="panel-sub">
        ${
          images.length === 0
            ? 'Референсов нет — хроники этого персонажа строятся <b>только по промпту</b>. Добавьте фото, если хотите, чтобы обстановка и образ попали в текст.'
            : 'Каждое фото разбирается моделью зрения, и <b>полученное описание</b> идёт в промпт всех хроник этого персонажа. В LLM уходит именно текст описания, а не сама картинка.'
        }
        ${slotsLeft <= 0 ? '<br><b>Достигнут предел ' + String(PERSONA_IMAGES_MAX) + ' фото на профиль.</b>' : ''}
      </div>

      <div id="uploadState"></div>
      <div id="imagesList">${this.renderImages(images)}</div>

      <div class="divider"></div>
      <div class="dim" style="font-size:12px;">
        Загрузка и повторный разбор расходуют тот же лимит, что и запуск генерации —
        15 запросов за 15 минут. Если упрётесь, кнопка «Сгенерировать» ответит ошибкой лимита.
      </div>`;

    this.bind();
  }

  private renderImages(images: PersonaImage[]): string {
    if (images.length === 0) {
      return `
        <div class="empty">
          <div class="icon">🖼️</div>
          <div class="title">Пока пусто</div>
          <div class="desc">Хроника будет построена по одному промпту. Это нормальный режим —
            фотографии нужны, только если вы хотите задать образ и обстановку.</div>
        </div>`;
    }

    return images
      .map((img) => {
        const described = img.description !== null && img.description.trim() !== '';
        const badge = described
          ? '<span class="badge badge-done">учитывается в промпте</span>'
          : '<span class="badge badge-partial">не учитывается</span>';

        const warning = described
          ? ''
          : `<div class="hint" style="color:#f59e0b;">Описание пустое — разбор не удался, и это фото
               <b>не влияет на генерацию</b>. Повторите разбор или впишите описание руками.</div>`;

        return `
          <div class="card" data-image-id="${img.id}">
            <div class="row" style="align-items:flex-start;gap:16px;">
              <img src="${escapeHtml(img.url)}" alt=""
                   style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid var(--border);flex-shrink:0;" />
              <div style="flex:1;min-width:0;">
                <div class="row" style="margin-bottom:8px;">
                  ${badge}
                  <div class="spacer"></div>
                  <button class="btn-secondary btn-sm" data-action="reanalyze">Разобрать заново</button>
                  <button class="btn-danger btn-sm" data-action="delete">Удалить</button>
                </div>
                <div class="field" style="margin-bottom:0;">
                  <label>Описание — ровно этот текст уходит в промпт</label>
                  <textarea rows="4" data-role="description">${escapeHtml(img.description ?? '')}</textarea>
                  ${warning}
                  <div class="row" style="margin-top:8px;">
                    <div class="spacer"></div>
                    <button class="btn-secondary btn-sm" data-action="save-description">
                      Сохранить описание
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>`;
      })
      .join('');
  }

  private bind(): void {
    const root = this.container;
    const input = query<HTMLInputElement>(root, '#imgInput');

    query<HTMLButtonElement>(root, '#btnUpload')?.addEventListener('click', () => {
      input?.click();
    });
    input?.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      if (files.length > 0) void this.upload(files);
    });

    onClick(root, '[data-action]', (el) => {
      const card = el.closest<HTMLElement>('[data-image-id]');
      const id = Number(card?.dataset.imageId);
      if (!Number.isInteger(id)) return;

      const action = el.dataset.action;
      if (action === 'reanalyze') void this.reanalyze(id, el as HTMLButtonElement);
      if (action === 'delete') void this.remove(id);
      if (action === 'save-description')
        void this.saveDescription(id, card, el as HTMLButtonElement);
    });
  }

  private async upload(files: File[]): Promise<void> {
    const persona = store.persona;
    if (persona === null || this.uploading) return;

    const free = PERSONA_IMAGES_MAX - persona.images.length;
    if (files.length > free) {
      // Сервер вернул бы 409, но лучше сказать это до долгой заливки.
      toast.error(
        `Осталось ${pluralWithCount(free, 'место', 'места', 'мест')} из ${PERSONA_IMAGES_MAX}, ` +
          `а выбрано ${files.length}.`
      );
      return;
    }

    const tooBig = files.find((file) => file.size > UPLOAD_BYTES_MAX);
    if (tooBig !== undefined) {
      toast.error(
        `«${tooBig.name}» — ${formatBytes(tooBig.size)}, предел ${formatBytes(UPLOAD_BYTES_MAX)}.`
      );
      return;
    }

    const state = query<HTMLElement>(this.container, '#uploadState');
    this.uploading = true;
    // Разбор идёт последовательно, по одному вызову vision на файл — это ощутимые секунды.
    if (state !== null) {
      state.innerHTML = `
        <div class="card">
          <div style="margin-bottom:8px;">Загрузка и разбор ${pluralWithCount(files.length, 'фото', 'фото', 'фото')}…</div>
          <div class="progress"><div class="progress-bar indeterminate"></div></div>
          <div class="hint">Каждая картинка разбирается моделью зрения по очереди, это занимает
            несколько секунд на файл. Не закрывайте вкладку.</div>
        </div>`;
    }

    try {
      const created = await PersonaImageApi.upload(persona.ownerToken, files);
      await store.reload();

      const failed = created.filter(
        (img) => img.description === null || img.description.trim() === ''
      ).length;
      if (failed === 0) {
        toast.success(`Добавлено ${pluralWithCount(created.length, 'фото', 'фото', 'фото')}.`);
      } else {
        toast.warn(
          `Загружено ${created.length}, но у ${failed} не получилось описание — ` +
            'такие фото в генерации не участвуют. Повторите разбор или впишите текст руками.'
        );
      }
    } catch (error) {
      toast.error(errorText(error));
      if (state !== null) state.innerHTML = '';
    } finally {
      this.uploading = false;
    }
  }

  private async reanalyze(imageId: number, button: HTMLButtonElement): Promise<void> {
    const persona = store.persona;
    if (persona === null) return;
    await withBusy(button, async () => {
      try {
        await PersonaImageApi.reanalyze(persona.ownerToken, imageId);
        await store.reload();
        toast.success('Описание обновлено.');
      } catch (error) {
        toast.error(errorText(error));
      }
    });
  }

  private async saveDescription(
    imageId: number,
    card: HTMLElement | null,
    button: HTMLButtonElement
  ): Promise<void> {
    const persona = store.persona;
    if (persona === null || card === null) return;
    const field = query<HTMLTextAreaElement>(card, '[data-role="description"]');
    if (field === null) return;

    const text = field.value.trim();
    await withBusy(button, async () => {
      try {
        await PersonaImageApi.updateDescription(
          persona.ownerToken,
          imageId,
          text === '' ? null : text
        );
        await store.reload();
        toast.success(
          text === ''
            ? 'Описание очищено — это фото больше не участвует в генерации.'
            : 'Описание сохранено.'
        );
      } catch (error) {
        toast.error(errorText(error));
      }
    });
  }

  private async remove(imageId: number): Promise<void> {
    const persona = store.persona;
    if (persona === null) return;

    const confirmed = await confirmDialog({
      title: 'Удалить референс?',
      message:
        'Фото и его описание будут удалены. Уже сгенерированные хроники не изменятся — ' +
        'но новые будут строиться без него.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await PersonaImageApi.remove(persona.ownerToken, imageId);
      await store.reload();
      toast.success('Референс удалён.');
    } catch (error) {
      toast.error(errorText(error));
    }
  }
}
