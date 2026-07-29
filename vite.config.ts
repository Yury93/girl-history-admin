import { defineConfig, loadEnv } from 'vite';

/**
 * Фронт живёт НЕ на корне домена, а по пути `/girl-history-admin/` (frontend_plan.md §6).
 *
 * `base` обязателен: без него собранный index.html тянет ассеты с корня (`/assets/index-*.js`),
 * а на корне сидит ЧУЖАЯ админка Lisa AI со своим SPA-fallback — она вернёт HTML вместо JS,
 * и мы получим белый экран при успешной сборке.
 *
 * Побочный эффект, о котором легко забыть: dev-сервер тоже отдаёт приложение по этому пути.
 * Открывать http://localhost:5174/girl-history-admin/, на корне будет 404.
 */
const BASE = '/girl-history-admin/';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Куда проксировать в деве. По умолчанию — локальный бэкенд.
  // 127.0.0.1, а НЕ localhost: бэкенд слушает 127.0.0.1, а localhost на этой машине
  // резолвится в ::1, где IPv6-loopback закрыт → соединения не будет.
  //
  // Проверка именно на пустую строку, а не `??`: loadEnv для незаданной переменной
  // возвращает '' (не undefined), поэтому `??` дефолт бы не подхватил и target уехал
  // бы в пустоту. Линтер здесь предлагает `??` — предложение неверное.
  const configuredTarget = env.VITE_API_TARGET?.trim() ?? '';
  const target = configuredTarget === '' ? 'http://127.0.0.1:3001' : configuredTarget;

  return {
    base: BASE,

    server: {
      // ЗАМЕРЕНО 2026-07-29: без явного host Vite слушает `[::1]:5174`, то есть ТОЛЬКО IPv6.
      // На этой машине IPv6-loopback закрыт, и сервер недоступен ни браузеру, ни curl —
      // при том что в консоли бодро печатается «ready». Тот же инвариант, из-за которого
      // у бэкенда стоит HOST=127.0.0.1 (girl-history/CLAUDE.md §Инварианты).
      host: '127.0.0.1',
      // 5173 (дефолт Vite) занимает соседний ai-prompt-admin — проекты поднимаются одновременно.
      port: 5174,
      // Без strictPort Vite молча уедет на 5175, и прокси-адреса в заметках перестанут совпадать.
      strictPort: true,
      proxy: {
        // Маршруты API бэкенд регистрирует БЕЗ префикса, поэтому /api снимаем.
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },

        // Картинки. Бэкенд отдаёт ссылки относительными, а префикс зависит от окружения:
        // локально PUBLIC_URL_PREFIX пуст → /media/..., на проде /girl-history → /girl-history/media/...
        // Правила нужны на ОБА варианта, иначе при переключении target картинки станут битыми.
        '/media': {
          target,
          changeOrigin: true,
        },

        // ВНИМАНИЕ: ключ — регулярное выражение (Vite так трактует всё, что начинается с ^),
        // и завершающий слэш здесь ОБЯЗАТЕЛЕН. Простая строка '/girl-history' сматчила бы
        // и '/girl-history-admin/...' — то есть наш собственный base — и dev-сервер начал бы
        // проксировать свои же ассеты на бэкенд. Приложение не запустилось бы вовсе.
        '^/girl-history/': {
          target,
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
