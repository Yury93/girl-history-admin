import { escapeHtml } from './dom.js';
import { toast } from './toast.js';
import { TAB_CHANGED_EVENT, gotoTab, isTabName, type TabName } from '../types/tab.js';
import {
  TAB_TITLES,
  TUTORIAL_STEPS,
  TUTORIAL_VERSION,
  type TutorialStep,
} from '../help/tutorial-steps.js';

/**
 * Движок курса «Обучение» (tutorial_plan.md).
 *
 * Панель — «спутник», а не модальный тур: живёт в <body> (переживает перерисовки
 * экранов), ничего не затемняет и не блокирует — оператор читает шаг и тут же пробует
 * руками. Прервать можно всегда, прогресс сохраняется в localStorage вместе с версией
 * курса: изменился состав шагов — сохранённый индекс сбрасывается, а не открывает чужой шаг.
 */

const STORAGE_KEY = 'nova-admin:tutorial';
export const TUTORIAL_STATE_EVENT = 'nova:tutorial-state';

const HIGHLIGHT_CLASS = 'tour-highlight';
/** Перерисовки экранов (поллинг «Генерации» — каждые 2 с) снимают класс — переприменяем. */
const REAPPLY_MS = 1000;
/** Ждать transitionend закрытия панели без страховки нельзя: при reduced-motion его нет. */
const CLOSE_FALLBACK_MS = 260;

let panel: HTMLElement | null = null;
let active = false;
let collapsed = false;
let stepIndex = 0;
let direction: 'fwd' | 'back' = 'fwd';
let currentTab: TabName | null = null;
let highlightTimer: number | null = null;
let scrolled = false;

// ─── Сохранение прогресса ─────────────────────────────────────────────────────

function readSavedStep(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as { step?: unknown; version?: unknown };
    if (record.version !== TUTORIAL_VERSION) return null;
    if (typeof record.step !== 'number') return null;
    if (record.step < 0 || record.step >= TUTORIAL_STEPS.length) return null;
    return record.step;
  } catch {
    return null;
  }
}

function saveStep(step: number): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, version: TUTORIAL_VERSION }));
}

// ─── Публичное API (кнопка в шапке) ───────────────────────────────────────────

export function tutorialStatus(): { active: boolean; savedStep: number | null; total: number } {
  return { active, savedStep: readSavedStep(), total: TUTORIAL_STEPS.length };
}

export function toggleTutorial(): void {
  if (active) stopTutorial();
  else startTutorial();
}

/** Подписки движка. Вызывается один раз из оболочки. */
export function initTutorial(): void {
  document.addEventListener(TAB_CHANGED_EVENT, (event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (typeof detail !== 'string' || !isTabName(detail)) return;
    currentTab = detail;
    // Пометка «этот шаг — про другой экран» зависит от текущей вкладки.
    if (active) renderStep();
  });
}

// ─── Жизненный цикл курса ─────────────────────────────────────────────────────

function startTutorial(): void {
  stepIndex = readSavedStep() ?? 0;
  active = true;
  collapsed = false;
  direction = 'fwd';
  document.body.classList.add('tutorial-active');
  renderStep();
  emitState();
}

function stopTutorial(): void {
  if (!active) return;
  saveStep(stepIndex);
  closePanel();
  toast.info(`Обучение прервано на шаге ${stepIndex + 1} — продолжить можно кнопкой в шапке.`);
  emitState();
}

function finishTutorial(): void {
  localStorage.removeItem(STORAGE_KEY);
  closePanel();
  toast.success('Курс пройден — поздравляем! «?» на экранах и гид в шапке всегда рядом.');
  emitState();
}

function emitState(): void {
  document.dispatchEvent(new CustomEvent(TUTORIAL_STATE_EVENT));
}

function closePanel(): void {
  active = false;
  stopHighlight();
  document.body.classList.remove('tutorial-active');
  const el = panel;
  panel = null;
  if (el === null) return;
  el.classList.add('closing');
  let removed = false;
  const remove = (): void => {
    if (removed) return;
    removed = true;
    el.remove();
  };
  el.addEventListener('transitionend', remove, { once: true });
  window.setTimeout(remove, CLOSE_FALLBACK_MS);
}

// ─── Панель ───────────────────────────────────────────────────────────────────

function ensurePanel(): HTMLElement {
  if (panel !== null) return panel;
  const el = document.createElement('aside');
  el.className = 'tutorial-panel';
  el.setAttribute('aria-label', 'Обучение');

  // Делегированные клики: innerHTML панели заменяется на каждом шаге.
  el.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.closest<HTMLElement>('[data-tut]')?.dataset.tut;
    if (action === undefined) return;
    switch (action) {
      case 'next':
        direction = 'fwd';
        goToStep(stepIndex + 1);
        break;
      case 'prev':
        direction = 'back';
        goToStep(stepIndex - 1);
        break;
      case 'restart':
        direction = 'back';
        goToStep(0);
        break;
      case 'stop':
        stopTutorial();
        break;
      case 'finish':
        finishTutorial();
        break;
      case 'collapse':
        collapsed = true;
        panel?.classList.add('collapsed');
        break;
      case 'expand':
        collapsed = false;
        panel?.classList.remove('collapsed');
        break;
      case 'return': {
        const tab = currentStep().tab;
        if (tab !== undefined) gotoTab(tab);
        break;
      }
    }
  });

  document.body.appendChild(el);
  panel = el;
  return el;
}

function currentStep(): TutorialStep {
  const step = TUTORIAL_STEPS[stepIndex];
  if (step === undefined) throw new Error(`Шага ${stepIndex} нет в курсе`);
  return step;
}

function goToStep(index: number): void {
  if (index < 0 || index >= TUTORIAL_STEPS.length) return;
  stepIndex = index;
  saveStep(stepIndex);
  renderStep();
  const tab = currentStep().tab;
  if (tab !== undefined && tab !== currentTab) gotoTab(tab);
}

function renderStep(): void {
  if (!active) return;
  const el = ensurePanel();
  const step = currentStep();
  const total = TUTORIAL_STEPS.length;
  const number = stepIndex + 1;
  const isLast = stepIndex === total - 1;
  const progress = Math.round((number / total) * 100);
  const offTab = step.tab !== undefined && currentTab !== null && currentTab !== step.tab;

  const body = step.body.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  const practice =
    step.practice === undefined
      ? ''
      : `<div class="tutorial-practice"><b>Попробуйте сами.</b> ${escapeHtml(step.practice)}</div>`;
  const checklist =
    step.checklist === undefined
      ? ''
      : `<ul class="grad-list">${step.checklist.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
  const footer = step.footer === undefined ? '' : `<p>${escapeHtml(step.footer)}</p>`;
  const notice =
    offTab && step.tab !== undefined
      ? `<div class="tutorial-notice">Этот шаг — про экран «${escapeHtml(TAB_TITLES[step.tab])}»
           <button type="button" class="btn-secondary btn-sm" data-tut="return">Вернуться</button></div>`
      : '';

  el.classList.toggle('collapsed', collapsed);
  el.innerHTML = `
    <button type="button" class="tutorial-pill" data-tut="expand">Обучение · шаг ${number}/${total} ▸</button>
    <div class="tutorial-inner">
      <div class="tutorial-head">
        <span class="tutorial-count">Шаг ${number} из ${total}</span>
        <span class="spacer"></span>
        ${
          stepIndex > 0
            ? `<button type="button" class="tutorial-icon-btn" data-tut="restart"
                 title="Начать заново" aria-label="Начать заново">⟲</button>`
            : ''
        }
        <button type="button" class="tutorial-icon-btn" data-tut="collapse"
          title="Свернуть" aria-label="Свернуть">—</button>
      </div>
      <div class="tutorial-progress"><span style="width: ${progress}%"></span></div>
      <div class="tutorial-step ${direction === 'fwd' ? 'step-fwd' : 'step-back'}">
        <h3>${escapeHtml(step.title)}</h3>
        ${body}
        ${practice}
        ${checklist}
        ${footer}
        ${notice}
      </div>
      <div class="tutorial-actions">
        <button type="button" class="btn-secondary btn-sm" data-tut="prev"
          ${stepIndex === 0 ? 'disabled' : ''}>← Назад</button>
        <span class="spacer"></span>
        <button type="button" class="btn-secondary btn-sm" data-tut="stop">Прервать</button>
        ${
          isLast
            ? '<button type="button" class="btn-primary btn-sm" data-tut="finish">Завершить</button>'
            : '<button type="button" class="btn-primary btn-sm" data-tut="next">Далее →</button>'
        }
      </div>
    </div>`;

  startHighlight(step.anchor ?? null);
}

// ─── Подсветка цели ───────────────────────────────────────────────────────────

function startHighlight(anchor: string | null): void {
  stopHighlight();
  if (anchor === null) return;
  scrolled = false;

  const apply = (): void => {
    const target = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
    if (target === null) return;
    if (!target.classList.contains(HIGHLIGHT_CLASS)) {
      clearHighlight();
      target.classList.add(HIGHLIGHT_CLASS);
      if (!scrolled) {
        scrolled = true;
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  };

  apply();
  highlightTimer = window.setInterval(apply, REAPPLY_MS);
}

function clearHighlight(): void {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS);
  });
}

function stopHighlight(): void {
  if (highlightTimer !== null) {
    window.clearInterval(highlightTimer);
    highlightTimer = null;
  }
  clearHighlight();
}
