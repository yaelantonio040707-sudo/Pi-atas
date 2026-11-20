import { createApp } from './app.js';
import { config } from './config.js';
import { aiEnabled } from './services/chatbot.js';
import { scheduleRetention } from './services/retention.js';

const app = createApp();
scheduleRetention();

app.listen(config.port, () => {
  console.log(`Keflita en http://localhost:${config.port}`);
  if (!config.siteUrl) console.warn('· SITE_URL no definido: el sitemap y el código QR no estarán disponibles.');
  if (!config.admin.passwordHash) console.warn('· ADMIN_PASSWORD_HASH no definido: el panel /admin no permitirá iniciar sesión.');
  console.log(aiEnabled() ? `· Asistente con IA activo (${config.ai.model}).` : '· Asistente en modo respuestas predefinidas (sin ANTHROPIC_API_KEY).');
});
