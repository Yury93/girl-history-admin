import { escapeHtml } from './dom.js';
import { animateModalClose } from './modal.js';
import { gotoTab, isTabName, type TabName } from '../types/tab.js';

/**
 * Гид «Как работает движок»: схема конвейера и чеклист первого запуска.
 * Открывается только кнопкой в шапке — автопоказа нет (operator-hints_plan.md §8 п.2).
 */

const FLOW: { title: string; note: string; arrow?: string }[] = [
  {
    title: 'Справочники',
    note: 'режимы · сетка недели · пулы · локации · гардероб · арка · отклонения',
    arrow: 'детерминированный генератор — без LLM, по зерну прогона',
  },
  {
    title: 'План дня',
    note: 'слоты: якорь, локация, лук, варианты из пулов → запись в реестр',
    arrow: 'один вызов LLM на день — только тексты',
  },
  {
    title: '4 поста',
    note: 'утро (TG) · главный (TikTok, единственный с картинкой) · кросспост (TG) · ночь (TG)',
    arrow: 'Higgsfield — картинка главного поста (если включён)',
  },
  {
    title: 'Лента',
    note: 'правка → draft → approved → published — только руками, автопубликации нет',
  },
];

const STEPS: { tab: TabName; text: string }[] = [
  { tab: 'settings', text: 'Настройки → «Импорт (missing)» — заполнить справочники из сида' },
  {
    tab: 'references',
    text: 'Референсы — загрузить файлы, отметить эталон; на проде создать SoulId',
  },
  { tab: 'character', text: 'Проверить Персонажа, Режимы, Сетку недели и Арку (дата старта!)' },
  {
    tab: 'deviations',
    text: 'Отклонения → «Сгенерировать план» месяца — иначе дни будут без событий',
  },
  { tab: 'trends', text: 'Тренды — по желанию добавить бриф на дату' },
  {
    tab: 'generation',
    text: 'Генерация — начать с одного дня без картинок и посмотреть «что выпало»',
  },
  { tab: 'feed', text: 'Лента — править тексты и менять статусы' },
];

export function openGuide(): void {
  const root = document.getElementById('modal-root');
  if (root === null) return;
  // Повторный клик по кнопке при открытом гиде не должен плодить вторую модалку.
  if (root.querySelector('.guide-modal') !== null) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const flow = FLOW.map(
    (step) => `
      <div class="guide-step">
        <b>${escapeHtml(step.title)}</b>
        <span class="guide-note">${escapeHtml(step.note)}</span>
      </div>
      ${step.arrow === undefined ? '' : `<div class="guide-arrow">↓ ${escapeHtml(step.arrow)}</div>`}`
  ).join('');

  const steps = STEPS.map(
    (step) => `
      <li>
        <span>${escapeHtml(step.text)}</span>
        <button type="button" class="btn-secondary btn-sm" data-goto="${step.tab}">Открыть</button>
      </li>`
  ).join('');

  backdrop.innerHTML = `
    <div class="modal guide-modal" role="dialog" aria-modal="true">
      <h3>Как работает движок</h3>
      <div class="guide-flow">${flow}</div>
      <h3>Первый запуск — по порядку</h3>
      <ol class="guide-steps">${steps}</ol>
      <div class="modal-actions">
        <button type="button" class="btn-primary" id="guideClose">Понятно</button>
      </div>
    </div>`;

  const close = (): void => {
    document.removeEventListener('keydown', onKey);
    animateModalClose(backdrop);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };

  backdrop.addEventListener('click', (event) => {
    const target = event.target;
    if (target === backdrop) {
      close();
      return;
    }
    if (!(target instanceof Element)) return;
    if (target.closest('#guideClose') !== null) {
      close();
      return;
    }
    const goto = target.closest<HTMLElement>('[data-goto]');
    if (goto !== null) {
      const tab = goto.dataset.goto ?? '';
      if (isTabName(tab)) {
        gotoTab(tab);
        close();
      }
    }
  });
  document.addEventListener('keydown', onKey);

  root.appendChild(backdrop);
  backdrop.querySelector<HTMLButtonElement>('#guideClose')?.focus();
}
