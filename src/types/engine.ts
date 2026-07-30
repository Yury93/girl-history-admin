/** Типы ответов движка. Повторяют DTO бэкенда — источник правды там. */

export type Slot = 'morning' | 'day' | 'evening' | 'night';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const SLOTS: readonly Slot[] = ['morning', 'day', 'evening', 'night'];
export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const SLOT_TITLES: Record<Slot, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
  night: 'Ночь',
};

export const WEEKDAY_TITLES: Record<Weekday, string> = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Вс',
};

// ─── Импорт ───────────────────────────────────────────────────────────────────

export interface ImportDefect {
  code: string;
  detail: string;
}

export interface ImportReport {
  mode: string;
  created: Record<string, number>;
  updated: Record<string, number>;
  skipped: Record<string, number>;
  warnings: string[];
  defects: ImportDefect[];
}

// ─── Справочники ──────────────────────────────────────────────────────────────

export interface Character {
  id: number;
  key: string;
  name: string;
  handle: string;
  age: number;
  birthday: string;
  city: string;
  hometown: string;
  home: string;
  dream: string;
  study: unknown;
  aiDisclosure: unknown;
  psychology: unknown;
  toneOfVoice: unknown;
  never: string[];
  constants: string[];
  environment: unknown;
  secretsLongArcs: unknown;
  version: number;
  updatedAt: string;
}

export interface CharacterRevision {
  version: number;
  note: string | null;
  createdAt: string;
  snapshot: unknown;
}

export interface SlotTimes {
  day: string;
  evening: string;
  night: string;
}

export interface Mode {
  key: string;
  title: string;
  dateFrom: string;
  dateTo: string;
  description: string;
  morningSlotStart: string;
  slotTimes: SlotTimes;
  sortOrder: number;
}

export interface CalendarEvent {
  id: number;
  dateFrom: string;
  dateTo: string | null;
  title: string;
  type: string;
  note: string | null;
}

export interface WeekGridSlot {
  slot: string;
  anchor: string;
  locations: string[];
  poolKeys: string[];
}

export interface WeekGridDay {
  modeKey: string;
  weekday: string;
  title: string;
  slots: WeekGridSlot[];
}

export interface PoolItem {
  id: number;
  key: string;
  text: string;
  category: string | null;
  isCanon: boolean;
  weight: number;
  maxPerCount: number | null;
  maxPerUnit: string | null;
  maxPerUnitCount: number;
  season: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface Pool {
  key: string;
  title: string;
  scope: string;
  cooldownRaw: string;
  minGapItems: number | null;
  minGapDays: number | null;
  noRepeatAdjacentDays: boolean;
  categoryNotRepeatAdjacent: boolean;
  categoryNotRepeatHauls: number | null;
  rotateAllBeforeRepeat: boolean;
  canonBias: number | null;
  seasonFilter: string | null;
  styleSeasonWeeksMin: number | null;
  styleSeasonWeeksMax: number | null;
  timesPerWeekMin: number | null;
  timesPerWeekMax: number | null;
  quest: { key: string; title: string; frequency: string } | null;
  items: PoolItem[];
}

export interface PoolAlert {
  id: number;
  poolKey: string;
  date: string;
  reason: string;
  detail: string | null;
  resolvedAt: string | null;
}

export interface Deviation {
  key: string;
  title: string;
  frequencyRaw: string;
  timesPerMonthMin: number;
  timesPerMonthMax: number;
  consequence: string | null;
  signal: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface SocialEvent {
  key: string;
  kind: string;
  title: string;
  style: string | null;
  frequencyPerMonthMin: number | null;
  frequencyPerMonthMax: number | null;
  rotationWeeksMin: number | null;
  rotationWeeksMax: number | null;
  startWeek: number | null;
  rule: string | null;
  forbidden: string | null;
  spikeDates: string[];
  isActive: boolean;
}

export interface LocationZone {
  key: string;
  title: string;
  content: string | null;
}

export interface EngineLocation {
  key: string;
  title: string;
  titleEn: string;
  type: string;
  season: string | null;
  content: string | null;
  refKeys: string[];
  zones: LocationZone[];
}

export interface WardrobeLook {
  key: string;
  title: string;
  mode: string | null;
  items: string[];
  refKey: string | null;
  locationKeys: string[];
  signal: string | null;
  hair: string | null;
  note: string | null;
  isActive: boolean;
}

export interface ReferenceImage {
  key: string;
  category: string;
  title: string | null;
  url: string | null;
  mime: string | null;
  bytes: number | null;
  isEtalon: boolean;
  soulId: string | null;
  hasFile: boolean;
  createdAt: string;
}

export interface ArcEpisode {
  week: number;
  title: string;
  goal: string;
}

export interface Arc {
  season: number;
  title: string;
  weeks: number;
  startDate: string;
  endDate: string;
  episodes: ArcEpisode[];
}

export interface Rubric {
  key: string;
  title: string;
  platforms: string[];
  purpose: string;
  share: string | null;
  guard: string | null;
  windowHours: number | null;
  sortOrder: number;
}

export interface PromptTemplate {
  key: string;
  kind: string;
  title: string;
  body: string;
}

export interface EngineSettings {
  deviationRatio: {
    norm: number;
    variation: number;
    episode: number;
    minDeviationsPerWeek: number;
  };
  dailyBase: { constants: string[]; themeCooldownDays: number };
  sceneTypeRules: {
    byLocationType: Record<string, string>;
    byLocationKey: Record<string, string>;
    grid: { rows: number; cols: number };
  };
  hairSignalRules: { default: string; specialEvent: string; streamKeywords: string[] };
  postingRules: {
    mainSlotDefault: string;
    mainSlotArc: string;
    arcWeekdays: string[];
    arcLocation: string;
    crosspostSlot: string;
    jitterMaxMinutes: number;
    rubricByPool: Record<string, string>;
    rubricDefault: string;
    rubricArc: string;
  };
  imageDefaults: {
    widthAndHeight: string;
    quality: string;
    styleId: string | null;
    styleStrength: number;
    customReferenceStrength: number;
  };
  contentFilter: { rules: { flag: string; pattern: string }[] };
}

// ─── Генерация ────────────────────────────────────────────────────────────────

export interface RunReportEntry {
  date: string;
  reason: string;
  detail?: string;
}

export interface GenerationRun {
  id: number;
  dateFrom: string;
  dateTo: string;
  seed: string;
  stage: string;
  status: string;
  overwrite: boolean;
  doneDays: number;
  totalDays: number;
  report: RunReportEntry[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  inputSnapshot?: unknown;
}

export interface SlotVariant {
  poolKey: string;
  itemKey: string;
  text: string;
  category: string | null;
}

export interface DayPlanSlot {
  slot: string;
  anchor: string;
  locationKey: string;
  wardrobeLookKey: string | null;
  hair: string | null;
  variants: SlotVariant[];
  exhaustedPools: string[];
  skippedPools: string[];
}

export interface DayPlan {
  date: string;
  runId: number;
  modeKey: string;
  weekday: string;
  arcWeek: number | null;
  arcEpisode: ArcEpisode | null;
  deviationKeys: string[];
  socialEventKeys: string[];
  constantKey: string | null;
  questKey: string | null;
  slots: DayPlanSlot[];
  postIds: number[];
}

export interface DayPlanBrief {
  date: string;
  modeKey: string;
  weekday: string;
}

export interface MonthlyPlanEntry {
  date: string;
  kind: string;
  key: string;
  note: string | null;
}

export interface MonthlyPlan {
  month: string;
  seed: string;
  generatedAt: string;
  entries: MonthlyPlanEntry[];
}

export interface RegistryRow {
  id: number;
  date: string;
  slot: string;
  poolKey: string;
  itemKey: string;
  text: string | null;
  runId: number | null;
}

// ─── Посты ────────────────────────────────────────────────────────────────────

export interface Post {
  id: number;
  runId: number | null;
  date: string;
  time: string;
  slot: string;
  kind: string;
  platform: string;
  rubricKey: string;
  locationKey: string;
  wardrobeLookKey: string | null;
  activity: string;
  hook: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string[];
  imagePrompt: string | null;
  imageUrl: string | null;
  imageStatus: string | null;
  imageError: string | null;
  status: string;
  moderatorNote: string | null;
  isEdited: boolean;
  filterFlags: string[];
  updatedAt: string;
}

export interface PromptRun {
  id: number;
  postId: number | null;
  kind: string;
  provider: string;
  model: string;
  prompt: string;
  response: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  error: string | null;
  createdAt: string;
}

export interface TrendBrief {
  id: number;
  date: string;
  source: string;
  topic: string;
  angleForNova: string;
  riskCheck: string;
  status: string;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
}
