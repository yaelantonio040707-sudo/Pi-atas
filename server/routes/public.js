// Rutas públicas: información del negocio, galería, preguntas frecuentes, pedidos y chat.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { db, tx, getSettings, listGallery, listFaqs, CATEGORIES } from '../db.js';
import { paths } from '../config.js';
import { upload, assertImages, saveImage, deleteStoredFile } from '../lib/uploads.js';
import { validateOrder, looksLikeSpam } from '../lib/validate.js';
import { answer, aiEnabled } from '../services/chatbot.js';

const router = Router();

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Has enviado varias solicitudes seguidas. Intenta de nuevo en unos minutos.' },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados mensajes seguidos. Espera un momento, por favor.' },
});

// Solo se exponen los campos pensados para el público.
const PUBLIC_SETTINGS = [
  'businessName', 'businessSubtitle', 'tagline', 'heroText', 'aboutText', 'aboutExtra',
  'whatsapp', 'phone', 'email', 'location', 'hours', 'facebook', 'instagram', 'tiktok',
  'deliveryInfo', 'paymentInfo', 'leadTimeInfo',
];

router.get('/site', (req, res) => {
  const s = getSettings();
  const site = Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, s[k] || '']));
  res.set('Cache-Control', 'no-cache');
  res.json({ ...site, categories: CATEGORIES, aiEnabled: aiEnabled() });
});

router.get('/gallery', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(listGallery().filter((g) => g.photos.length).map(({ visible, sort, ...g }) => g));
});

router.get('/faqs', (req, res) => {
  res.json(listFaqs().map(({ id, question, answer }) => ({ id, question, answer })));
});

const orderFiles = upload.fields([
  { name: 'references', maxCount: 4 },
  { name: 'sketch', maxCount: 1 },
]);

router.post('/orders', orderLimiter, orderFiles, async (req, res, next) => {
  try {
    if (looksLikeSpam(req.body)) {
      return res.status(400).json({ error: 'No pudimos procesar la solicitud. Recarga la página e inténtalo de nuevo.' });
    }
    const { data, errors } = validateOrder(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Revisa los campos marcados.', fields: errors });

    const references = req.files?.references || [];
    const sketch = req.files?.sketch || [];
    assertImages([...references, ...sketch]);

    const saved = [];
    try {
      for (const f of references) saved.push({ kind: 'referencia', ...(await saveImage(f, paths.orderUploads)) });
      for (const f of sketch) saved.push({ kind: 'boceto', ...(await saveImage(f, paths.orderUploads)) });

      const code = `KF-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      tx(() => {
        const { lastInsertRowid: orderId } = db
          .prepare(
            `INSERT INTO orders (code, name, phone, product_type, product_other, size, theme, colors, quantity, needed_date, description, budget)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(code, data.name, data.phone, data.product_type, data.product_other, data.size, data.theme,
            data.colors, data.quantity, data.needed_date, data.description, data.budget);
        const insFile = db.prepare(
          'INSERT INTO order_files (order_id, kind, filename, original, mime, size) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const f of saved) insFile.run(orderId, f.kind, f.filename, f.original, f.mime, f.size);
      });
      res.status(201).json({ ok: true, code });
    } catch (e) {
      for (const f of saved) await deleteStoredFile(paths.orderUploads, f.filename);
      throw e;
    }
  } catch (e) {
    next(e);
  }
});

router.post('/chat', chatLimiter, async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Escribe un mensaje.' });
    if (message.length > 1000) return res.status(400).json({ error: 'El mensaje es demasiado largo.' });
    res.json(await answer(message, req.body?.history));
  } catch (e) {
    next(e);
  }
});

export default router;
