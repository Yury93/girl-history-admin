import { LocationsApi, ModesApi, PoolsApi, WeekGridApi } from '../../api/engine-api.js';
import { errorText } from '../../api/http.js';
import { escapeHtml, onClick, withBusy } from '../../ui/dom.js';
import { toast } from '../../ui/toast.js';
import { BaseScreen, emptyBox, screenHead } from '../../ui/screen.js';
import {
  SLOTS,
  SLOT_TITLES,
  WEEKDAYS,
  WEEKDAY_TITLES,
  type EngineLocation,
  type Mode,
  type Pool,
  type Slot,
  type Weekday,
  type WeekGridDay,
} from '../../types/engine.js';

/**
 * Сетка недели «день × слот» — то, из чего собирается каждый день.
 *
 * Правка идёт ДНЁМ целиком, а не по одному слоту: так же устроен и эндпоинт. Ключи пулов
 * и локаций проверяет сервер — FK у них нет, и опечатка молча превратилась бы в слот,
 * который движок пропускает.
 */
export class WeekGridComponent extends BaseScreen {
  private modes: Mode[] = [];
  private days: WeekGridDay[] = [];
  private pools: Pool[] = [];
  private locations: EngineLocation[] = [];
  private activeMode = '';
  private bound = false;

  protected async load(): Promise<void> {
    [this.modes, this.pools, this.locations] = await Promise.all([
      ModesApi.list(),
      PoolsApi.list(),
      LocationsApi.list(),
    ]);
    if (this.activeMode === '') this.activeMode = this.modes[0]?.key ?? '';
    this.days = await WeekGridApi.list(this.activeMode === '' ? undefined : this.activeMode);
  }

  protected render(): void {
    if (this.modes.length === 0) {
      this.root.innerHTML = emptyBox('Режимов нет — выполните импорт справочников');
      return;
    }

    const tabs = this.modes
      .map(
        (m) =>
          `<button class="chip ${m.key === this.activeMode ? 'active' : ''}" data-mode="${escapeHtml(m.key)}">
             ${escapeHtml(m.title)}</button>`
      )
      .join('');

    this.root.innerHTML = `
      ${screenHead(
        'Сетка недели',
        'Якорь, локации и пулы каждого слота. Несколько локаций = чередование (как library|beach).',
        tabs
      )}
      ${this.keyHints()}
      <div class="grid-days">${WEEKDAYS.map((wd) => this.dayCard(wd)).join('')}</div>`;
    this.bind();
  }

  /**
   * Подсказка с доступными ключами. Пулы и локации вводятся текстом, а FK у них нет —
   * сервер отвергнет опечатку, но искать её среди семи дней дольше, чем свериться со списком.
   */
  private keyHints(): string {
    const pools = this.pools.map((p) => escapeHtml(p.key)).join(', ');
    const locations = this.locations.map((l) => escapeHtml(l.key)).join(', ');
    return `<section class="card">
      <h3>Доступные ключи</h3>
      <p class="hint"><b>Пулы:</b> ${pools}</p>
      <p class="hint"><b>Локации:</b> ${locations}</p>
    </section>`;
  }

  private dayCard(weekday: Weekday): string {
    const day = this.days.find((d) => d.weekday === weekday);
    const title = day?.title ?? '';
    const slots = SLOTS.map((slot) => this.slotRow(weekday, slot, day)).join('');
    return `
      <section class="card day-card" data-day="${weekday}">
        <h3>${WEEKDAY_TITLES[weekday]} — <input type="text" class="inline-title" data-name="title-${weekday}"
             value="${escapeHtml(title)}" placeholder="название дня" /></h3>
        ${slots}
        <button class="btn-primary btn-sm" data-save-day="${weekday}">Сохранить день</button>
      </section>`;
  }

  private slotRow(weekday: Weekday, slot: Slot, day: WeekGridDay | undefined): string {
    const found = day?.slots.find((s) => s.slot === slot);
    const enabled = found !== undefined;
    return `
      <div class="slot-row ${enabled ? '' : 'slot-off'}">
        <label class="checkbox slot-toggle">
          <input type="checkbox" data-name="on-${weekday}-${slot}" ${enabled ? 'checked' : ''} />
          <b>${SLOT_TITLES[slot]}</b>
        </label>
        <input type="text" data-name="anchor-${weekday}-${slot}" placeholder="якорь"
               value="${escapeHtml(found?.anchor ?? '')}" />
        <input type="text" data-name="loc-${weekday}-${slot}" placeholder="локации через |"
               value="${escapeHtml((found?.locations ?? []).join('|'))}" />
        <input type="text" data-name="pools-${weekday}-${slot}" placeholder="пулы через запятую"
               value="${escapeHtml((found?.poolKeys ?? []).join(','))}" />
      </div>`;
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;

    onClick(this.root, '[data-mode]', (btn) => {
      const key = btn.dataset.mode ?? '';
      if (key === this.activeMode) return;
      this.activeMode = key;
      this.invalidate();
      void this.reload();
    });

    onClick(this.root, '[data-save-day]', (btn) => {
      const weekday = btn.dataset.saveDay ?? '';
      void withBusy(btn as HTMLButtonElement, () => this.saveDay(weekday));
    });

    // Галочка слота гасит строку визуально — сразу видно, что слот не попадёт в день.
    //
    // Подписка ДЕЛЕГИРОВАННАЯ, на контейнер: bind() выполняется один раз, а render()
    // заменяет innerHTML целиком. Слушатели, навешанные на сами чекбоксы, не пережили бы
    // первую же перерисовку (переключение режима или сохранение дня), и строки перестали
    // бы гаснуть — при том что сохранение продолжало бы работать, то есть поломка была бы
    // молчаливой.
    this.root.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.closest('.slot-toggle') === null) return;
      target.closest('.slot-row')?.classList.toggle('slot-off', !target.checked);
    });
  }

  private async saveDay(weekday: string): Promise<void> {
    const read = (name: string): string =>
      this.root.querySelector<HTMLInputElement>(`[data-name="${name}"]`)?.value.trim() ?? '';
    const checked = (name: string): boolean =>
      this.root.querySelector<HTMLInputElement>(`[data-name="${name}"]`)?.checked ?? false;

    const slots = SLOTS.filter((slot) => checked(`on-${weekday}-${slot}`)).map((slot) => ({
      slot,
      anchor: read(`anchor-${weekday}-${slot}`),
      locations: read(`loc-${weekday}-${slot}`)
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s !== ''),
      poolKeys: read(`pools-${weekday}-${slot}`)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== ''),
    }));

    const bad = slots.find((s) => s.anchor === '' || s.locations.length === 0);
    if (bad !== undefined) {
      toast.warn(`Слот «${bad.slot}»: нужны якорь и хотя бы одна локация`);
      return;
    }

    try {
      await WeekGridApi.saveDay(this.activeMode, weekday, {
        title: read(`title-${weekday}`),
        slots,
      });
      toast.success(`День ${weekday} сохранён`);
      this.invalidate();
      await this.reload();
    } catch (e: unknown) {
      toast.error(errorText(e));
    }
  }
}
