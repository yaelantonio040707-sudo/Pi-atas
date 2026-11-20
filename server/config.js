// Configuración central: todas las variables de entorno se leen aquí.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

const isProd = env.NODE_ENV === 'production';

export const config = {
  root,
  isProd,
  port: Number(env.PORT) || 3000,
  // URL pública definitiva (sin "/" final). Se usa para SEO, sitemap y código QR.
  siteUrl: (env.SITE_URL || '').replace(/\/+$/, ''),
  dataDir: path.resolve(root, env.DATA_DIR || 'data'),
  publicDir: path.join(root, 'public'),

  admin: {
    // Usuario del panel y hash scrypt de la contraseña (genéralo con `npm run admin:hash`).
    username: env.ADMIN_USERNAME || 'admin',
    passwordHash: env.ADMIN_PASSWORD_HASH || '',
    sessionHours: Number(env.ADMIN_SESSION_HOURS) || 12,
  },

  ai: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    effort: env.ANTHROPIC_EFFORT || 'low',
  },

  // Datos de contacto iniciales. Se pueden cambiar después desde el panel.
  // Se dejan vacíos a propósito: no se inventan teléfonos ni correos.
  defaults: {
    whatsapp: (env.WHATSAPP_NUMBER || '').replace(/[^\d]/g, ''),
  },

  uploads: {
    maxFileMb: Number(env.MAX_UPLOAD_MB) || 8,
    maxFiles: 4,
  },
};

export const paths = {
  db: path.join(config.dataDir, 'keflita.db'),
  orderUploads: path.join(config.dataDir, 'uploads', 'orders'),
  galleryUploads: path.join(config.dataDir, 'uploads', 'gallery'),
};
