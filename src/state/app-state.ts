import { PersonaApi } from '../api/persona-api.js';
import type { PersonaListItem, PersonaOwner } from '../types/persona.js';

/**
 * Общее состояние: какой профиль выбран и что мы о нём знаем.
 *
 * Нужно, потому что сайдбар и вкладки должны договариваться: выбрали профиль в сайдбаре —
 * вкладки показывают его; отредактировали промпт во вкладке — в сайдбаре обновилось имя.
 * Гонять эти события через App значило бы протаскивать колбэки через все компоненты.
 *
 * Подписка синхронная и без диффа: списки здесь короткие (профилей у человека единицы),
 * а перерисовать целиком проще и надёжнее, чем сверять узлы.
 */

const SELECTED_KEY = 'gh-admin:selected-owner-token';

type Listener = () => void;

class AppStore {
  private readonly listeners = new Set<Listener>();
  private personas: PersonaListItem[] = [];
  private current: PersonaOwner | null = null;
  private listLoaded = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  get list(): readonly PersonaListItem[] {
    return this.personas;
  }

  get isListLoaded(): boolean {
    return this.listLoaded;
  }

  get persona(): PersonaOwner | null {
    return this.current;
  }

  /** Право правки выбранного профиля. null — профиль не выбран. */
  get ownerToken(): string | null {
    return this.current?.ownerToken ?? this.remembered();
  }

  private remembered(): string | null {
    return localStorage.getItem(SELECTED_KEY);
  }

  async loadList(): Promise<void> {
    const result = await PersonaApi.list(100, 0);
    this.personas = result.items;
    this.listLoaded = true;

    // Выбранный профиль мог быть удалён в другой вкладке — тогда снимаем выбор.
    const token = this.current?.ownerToken ?? this.remembered();
    if (token !== null && !this.personas.some((p) => p.ownerToken === token)) {
      this.current = null;
      localStorage.removeItem(SELECTED_KEY);
    }
    this.emit();
  }

  /** Загружает профиль целиком: промпт, референсы, список хроник. */
  async select(ownerToken: string): Promise<void> {
    if (this.current?.ownerToken === ownerToken) return;
    localStorage.setItem(SELECTED_KEY, ownerToken);
    this.current = await PersonaApi.get(ownerToken);
    this.emit();
  }

  /** Перечитать выбранный профиль с сервера. */
  async reload(): Promise<void> {
    const token = this.current?.ownerToken ?? this.remembered();
    if (token === null) return;
    this.current = await PersonaApi.get(token);
    this.emit();
  }

  /** Ответ PATCH — уже полный профиль, второй запрос не нужен. */
  applyPersona(persona: PersonaOwner): void {
    this.current = persona;
    localStorage.setItem(SELECTED_KEY, persona.ownerToken);
    this.emit();
  }

  clearSelection(): void {
    this.current = null;
    localStorage.removeItem(SELECTED_KEY);
    this.emit();
  }

  /**
   * Восстановление после перезагрузки страницы: список + ранее выбранный профиль.
   * Если сохранённый токен больше не существует, тихо остаёмся без выбора.
   */
  async init(): Promise<void> {
    await this.loadList();
    const token = this.remembered();
    if (token === null) return;
    if (!this.personas.some((p) => p.ownerToken === token)) return;
    await this.select(token);
  }
}

export const store = new AppStore();
