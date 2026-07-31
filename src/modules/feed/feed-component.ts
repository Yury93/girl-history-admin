import { PostsApi } from '../../api/engine-api.js';
import { ApiError, creditsExhaustedText, errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { BaseScreen, badge, emptyBox, helpMark, screenHead } from '../../ui/screen.js';
import type { Post } from '../../types/engine.js';

const PAGE = 40;

/**
 * Лента постов и модерация.
 *
 * Правка требует прочитанный `updatedAt` — оптимистичная блокировка: две вкладки иначе
 * затирали бы друг друга молча. Успешное сохранение ставит `isEdited=true`, и после этого
 * перегенерация обходит весь день стороной.
 *
 * Пост со сработавшими фильтрами «никогда» одобряется только с подтверждением: фильтр не
 * блокирует публикацию, но и проскочить незамеченным не должен.
 */
export class FeedComponent extends BaseScreen {
  private posts: Post[] = [];
  private total = 0;
  private filters = { from: '', to: '', status: '', platform: '', kind: '' };
  private openId: number | null = null;
  private bound = false;

  protected async load(): Promise<void> {
    const params: Record<string, string | number> = { limit: PAGE, offset: 0 };
    for (const [key, value] of Object.entries(this.filters)) {
      if (value !== '') params[key] = value;
    }
    const result = await PostsApi.list(params);
    this.posts = result.items;
    this.total = result.total;
  }

  protected render(): void {
    this.root.innerHTML = `
      ${screenHead(
        'Лента постов',
        `Найдено ${this.total}. Автопубликации нет — статус меняет человек.`,
        '',
        'feed'
      )}
      <div class="filters">
        <input type="date" data-name="from" value="${escapeHtml(this.filters.from)}" />
        <input type="date" data-name="to" value="${escapeHtml(this.filters.to)}" />
        <select data-name="status">
          <option value="">любой статус</option>
          <option value="draft">draft</option>
          <option value="approved">approved</option>
          <option value="published">published</option>
          <option value="rejected">rejected</option>
        </select>
        <select data-name="kind">
          <option value="">любой тип</option>
          <option value="main">main</option>
          <option value="crosspost">crosspost</option>
          <option value="touch">touch</option>
          <option value="night">night</option>
        </select>
        <select data-name="platform">
          <option value="">любая площадка</option>
          <option value="tiktok">tiktok</option>
          <option value="telegram">telegram</option>
        </select>
        ${helpMark('kind')}
        <button class="btn-secondary" id="applyFilters">Показать</button>
      </div>
      ${this.posts.length === 0 ? emptyBox('Постов нет') : this.posts.map((p) => this.postCard(p)).join('')}`;
    this.bind();
    this.applyFilterValues();
  }

  private postCard(post: Post): string {
    const open = this.openId === post.id;
    return `
      <article class="post-card ${post.filterFlags.length > 0 ? 'flagged' : ''}">
        <div class="post-head" data-open="${post.id}">
          <div class="post-when">
            <b>${escapeHtml(post.date)}</b> ${escapeHtml(post.time)}
          </div>
          <div class="post-tags">
            ${badge(post.kind, post.kind === 'main' ? 'ok' : '')}
            ${badge(post.platform)}
            ${badge(post.rubricKey)}
            ${badge(post.status, statusKind(post.status))}
            ${post.isEdited ? badge('правлен', 'warn') : ''}
            ${post.filterFlags.map((f) => badge(f, 'error')).join(' ')}
          </div>
          <div class="post-preview">${escapeHtml((post.hook ?? post.caption ?? post.activity).slice(0, 120))}</div>
        </div>
        ${open ? this.postBody(post) : ''}
      </article>`;
  }

  private postBody(post: Post): string {
    return `
      <div class="post-body">
        <div class="post-main">
          <div class="field"><label>Активность (сценарий)</label>
            <div class="readonly">${escapeHtml(post.activity)}</div></div>
          <div class="field"><label>Хук</label>
            <input type="text" data-p-hook="${post.id}" value="${escapeHtml(post.hook ?? '')}" /></div>
          <div class="field"><label>Текст</label>
            <textarea data-p-caption="${post.id}" rows="5">${escapeHtml(post.caption ?? '')}</textarea></div>
          <div class="field"><label>CTA</label>
            <input type="text" data-p-cta="${post.id}" value="${escapeHtml(post.cta ?? '')}" /></div>
          <div class="field"><label>Хэштеги (через пробел)</label>
            <input type="text" data-p-tags="${post.id}" value="${escapeHtml(post.hashtags.join(' '))}" /></div>
          ${
            post.imagePrompt === null
              ? ''
              : `<details class="field"><summary>Промпт изображения</summary>
                   <div class="readonly mono small">${escapeHtml(post.imagePrompt)}</div></details>`
          }
        </div>
        <div class="post-side">
          ${
            post.imageUrl === null
              ? `<div class="ref-thumb"><span class="ref-empty">${escapeHtml(imageEmptyText(post))}</span></div>`
              : `<img class="post-image" src="${escapeHtml(post.imageUrl)}" alt="" />`
          }
          <div class="post-actions">
            <button class="btn-primary btn-sm" data-save="${post.id}">Сохранить</button>
            <button class="btn-secondary btn-sm" data-regen="${post.id}">Переписать текст</button>
            <button class="btn-secondary btn-sm" data-image="${post.id}">Картинка</button>
          </div>
          <div class="post-actions">
            ${statusButtons(post)}
          </div>
          <button class="btn-danger btn-sm" data-del="${post.id}">Удалить пост</button>
        </div>
      </div>`;
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '#applyFilters', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        this.filters = {
          from: this.read('from'),
          to: this.read('to'),
          status: this.read('status'),
          platform: this.read('platform'),
          kind: this.read('kind'),
        };
        this.invalidate();
        await this.reload();
      });
    });

    onClick(this.root, '[data-open]', (el) => {
      const id = Number(el.dataset.open);
      this.openId = this.openId === id ? null : id;
      this.render();
    });

    onClick(this.root, '[data-save]', (btn) => {
      const id = Number(btn.dataset.save);
      void withBusy(btn as HTMLButtonElement, () => this.savePost(id));
    });

    onClick(this.root, '[data-regen]', (btn) => {
      const id = Number(btn.dataset.regen);
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          await PostsApi.regenerateText(id);
          toast.success('Текст переписан');
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-image]', (btn) => {
      const id = Number(btn.dataset.image);
      void withBusy(btn as HTMLButtonElement, async () => {
        try {
          // Сбой провайдера НЕ приходит ошибкой HTTP: бэкенд глотает его и отдаёт пост
          // с imageStatus='failed' и причиной в imageError. Успех — только наличие файла.
          const updated = await PostsApi.generateImage(id);
          if (updated.imageUrl === null) {
            const raw = updated.imageError ?? updated.imageStatus ?? 'причина неизвестна';
            toast.error(creditsExhaustedText(raw) ?? `Картинка не сгенерирована: ${raw}`);
          } else {
            toast.success('Картинка сгенерирована');
          }
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });

    onClick(this.root, '[data-status]', (btn) => {
      const id = Number(btn.dataset.postId);
      const status = btn.dataset.status ?? '';
      void withBusy(btn as HTMLButtonElement, () => this.changeStatus(id, status));
    });

    onClick(this.root, '[data-del]', (btn) => {
      const id = Number(btn.dataset.del);
      void (async () => {
        const ok = await confirmDialog({
          title: 'Удалить пост?',
          message: 'Пост исчезнет из ленты. Запись реестра вариаций при этом останется.',
          danger: true,
          confirmLabel: 'Удалить',
        });
        if (!ok) return;
        try {
          await PostsApi.remove(id);
          this.invalidate();
          await this.reload();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      })();
    });
  }

  private async savePost(id: number): Promise<void> {
    const post = this.posts.find((p) => p.id === id);
    if (post === undefined) return;
    const get = (attr: string): string =>
      this.root
        .querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-p-${attr}="${id}"]`)
        ?.value.trim() ?? '';

    try {
      await PostsApi.update(id, {
        // Сервер сверит его с текущим и ответит 409, если пост изменился в другой вкладке.
        expectedUpdatedAt: post.updatedAt,
        hook: get('hook') === '' ? null : get('hook'),
        caption: get('caption') === '' ? null : get('caption'),
        cta: get('cta') === '' ? null : get('cta'),
        hashtags: get('tags')
          .split(/\s+/)
          .filter((t) => t !== ''),
      });
      toast.success('Сохранено. Перегенерация теперь обойдёт этот день стороной.');
      this.invalidate();
      await this.reload();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.isConflict) {
        toast.warn('Пост изменился с момента загрузки — обновляю и открываю заново.');
        this.invalidate();
        await this.reload();
        return;
      }
      toast.error(errorText(e));
    }
  }

  private async changeStatus(id: number, status: string): Promise<void> {
    try {
      await PostsApi.changeStatus(id, status, false);
      toast.success(`Статус: ${status}`);
      this.invalidate();
      await this.reload();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.isConflict) {
        const ok = await confirmDialog({
          title: 'Сработали фильтры «никогда»',
          message: `${e.serverMessage ?? ''}\n\nОдобрить всё равно?`,
          danger: true,
          confirmLabel: 'Одобрить несмотря на флаги',
        });
        if (!ok) return;
        try {
          await PostsApi.changeStatus(id, status, true);
          toast.success(`Статус: ${status} (принудительно)`);
          this.invalidate();
          await this.reload();
        } catch (inner: unknown) {
          toast.error(errorText(inner));
        }
        return;
      }
      toast.error(errorText(e));
    }
  }

  private read(name: string): string {
    return (
      this.root
        .querySelector<HTMLInputElement | HTMLSelectElement>(`[data-name="${name}"]`)
        ?.value.trim() ?? ''
    );
  }

  /** Значения фильтров в select восстанавливаются после перерисовки. */
  private applyFilterValues(): void {
    for (const [name, value] of Object.entries(this.filters)) {
      const el = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[data-name="${name}"]`
      );
      if (el !== null) el.value = value;
    }
  }
}

/** Текст на месте отсутствующей картинки: причина сбоя важнее кода статуса. */
function imageEmptyText(post: Post): string {
  if (post.imageStatus === null) return 'картинка не генерировалась';
  if (post.imageError === null) return post.imageStatus;
  return creditsExhaustedText(post.imageError) ?? `${post.imageStatus}: ${post.imageError}`;
}

/** Кнопки только для разрешённых сервером переходов — остальные вернули бы 400. */
function statusButtons(post: Post): string {
  const allowed: Record<string, string[]> = {
    draft: ['approved', 'rejected'],
    approved: ['published', 'rejected', 'draft'],
    published: ['rejected'],
    rejected: ['draft'],
  };
  return (allowed[post.status] ?? [])
    .map(
      (s) =>
        `<button class="btn-secondary btn-sm" data-status="${s}" data-post-id="${post.id}">→ ${s}</button>`
    )
    .join('');
}

function statusKind(status: string): string {
  if (status === 'published') return 'ok';
  if (status === 'rejected') return 'error';
  if (status === 'approved') return 'warn';
  return '';
}
