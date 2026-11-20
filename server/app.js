// Construcción de la aplicación Express (separada de index.js para poder probarla).
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import QRCode from 'qrcode';
import path from 'node:path';
import { config, paths } from './config.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import legalRoutes from './routes/legal.js';
import { requireAdmin } from './lib/auth.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  // En producción todo el tráfico va por HTTPS (los datos de los formularios viajan cifrados).
  if (config.isProd && process.env.FORCE_HTTPS !== '0') {
    app.use((req, res, next) => {
      if (req.secure || ['localhost', '127.0.0.1'].includes(req.hostname)) return next();
      res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  // --- API ---
  app.use('/api', publicRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/api/admin-qr.png', requireAdmin, async (req, res, next) => {
    try {
      if (!config.siteUrl) return res.status(409).json({ error: 'Define SITE_URL con la dirección pública del sitio.' });
      const width = Math.min(Math.max(Number(req.query.size) || 1024, 256), 4096);
      const png = await QRCode.toBuffer(config.siteUrl, { width, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#3b1d6e', light: '#ffffff' } });
      res.type('png');
      if (req.query.download) res.attachment(`qr-keflita-${width}.png`);
      res.send(png);
    } catch (e) {
      next(e);
    }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

  // --- SEO ---
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n${config.siteUrl ? `Sitemap: ${config.siteUrl}/sitemap.xml\n` : ''}`
    );
  });
  app.get('/sitemap.xml', (req, res) => {
    if (!config.siteUrl) return res.status(404).end();
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/aviso-de-privacidad', '/terminos-y-condiciones', '/devoluciones-y-garantias', '/derechos-arco']
        .map((p) => `<url><loc>${config.siteUrl}${p}</loc></url>`).join('')}</urlset>`
    );
  });

  // --- Páginas legales ---
  app.use(legalRoutes);

  // --- Archivos estáticos ---
  app.use('/media/gallery', express.static(paths.galleryUploads, { maxAge: '30d', immutable: true, fallthrough: false }));
  app.get('/admin', (req, res) => res.sendFile(path.join(config.publicDir, 'admin.html')));
  app.use(
    express.static(config.publicDir, {
      extensions: ['html'],
      setHeaders(res, file) {
        if (/\.(jpg|jpeg|png|webp|ico)$/.test(file)) res.set('Cache-Control', 'public, max-age=604800');
        else res.set('Cache-Control', 'no-cache');
      },
    })
  );

  app.use((req, res) => res.status(404).sendFile(path.join(config.publicDir, '404.html')));

  // --- Manejo de errores ---
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let message = err.expose || status < 500 ? err.message : 'Ocurrió un error inesperado. Intenta de nuevo.';
    if (err instanceof multer.MulterError) {
      status = 400;
      message = {
        LIMIT_FILE_SIZE: `Cada imagen debe pesar menos de ${config.uploads.maxFileMb} MB.`,
        LIMIT_FILE_COUNT: 'Demasiadas imágenes. Máximo 4 fotos de referencia.',
        LIMIT_UNEXPECTED_FILE: 'Demasiadas imágenes o campo de archivo no esperado.',
      }[err.code] || 'No se pudieron procesar los archivos.';
    }
    if (status >= 500) console.error(err);
    if (req.path.startsWith('/api') || req.path.startsWith('/media')) return res.status(status).json({ error: message });
    res.status(status).send(message);
  });

  return app;
}
