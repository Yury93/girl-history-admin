import { ArcApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import {
  BaseScreen,
  card,
  dateInput,
  field,
  helpMark,
  readValue,
  screenHead,
  table,
} from '../../ui/screen.js';
import type { Arc } from '../../types/engine.js';

/**
 * Арка сезона.
 *
 * `startDate` — якорь недели 1. В сиде его НЕТ, и без него шаг «наложить арку» невычислим,
 * как и правило «поклонники включаются с недели 3–4». Сдвиг этой даты сдвигает весь сезон.
 */
export class ArcComponent extends BaseScreen {
  private arc: Arc | null = null;
  private bound = false;

  protected async load(): Promise<void> {
    this.arc = await ArcApi.get();
  }

  protected render(): void {
    const arc = this.arc;
    if (arc === null) return;

    this.root.innerHTML = `
      ${screenHead(
        `Сезон ${arc.season}: ${arc.title}`,
        `${arc.weeks} недель, ${escapeHtml(arc.startDate)} — ${escapeHtml(arc.endDate)}. ` +
          `Неделя 1 отсчитывается от даты старта${helpMark('arc')}.`,
        '<button class="btn-primary" id="saveArc">Сохранить</button>',
        'arc'
      )}
      ${card(
        'Якорь сезона',
        `<div class="grid-2">
           ${field('Название', `<input type="text" data-name="title" value="${escapeHtml(arc.title)}" />`)}
           ${field('Дата старта', dateInput('startDate', arc.startDate), 'Сдвигает весь сезон целиком.')}
         </div>`
      )}
      ${card('Эпизоды по неделям', this.episodesTable(arc))}`;
    this.bind();
  }

  private episodesTable(arc: Arc): string {
    return table(
      ['Неделя', 'Название', 'Цель'],
      arc.episodes.map(
        (e) => `<tr>
          <td>${e.week}</td>
          <td><input type="text" data-ep-title="${e.week}" value="${escapeHtml(e.title)}" /></td>
          <td><input type="text" data-ep-goal="${e.week}" value="${escapeHtml(e.goal)}" /></td>
        </tr>`
      )
    );
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '#saveArc', (btn) => {
      void withBusy(btn as HTMLButtonElement, async () => {
        const arc = this.arc;
        if (arc === null) return;
        const episodes = arc.episodes.map((e) => ({
          week: e.week,
          title:
            this.root
              .querySelector<HTMLInputElement>(`[data-ep-title="${e.week}"]`)
              ?.value.trim() ?? e.title,
          goal:
            this.root.querySelector<HTMLInputElement>(`[data-ep-goal="${e.week}"]`)?.value.trim() ??
            e.goal,
        }));
        try {
          this.arc = await ArcApi.save({
            season: arc.season,
            title: readValue(this.root, 'title'),
            weeks: arc.weeks,
            startDate: readValue(this.root, 'startDate'),
            episodes,
          });
          toast.success('Арка сохранена');
          this.render();
        } catch (e: unknown) {
          toast.error(errorText(e));
        }
      });
    });
  }
}
