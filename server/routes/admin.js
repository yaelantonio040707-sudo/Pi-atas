// Panel de administración (todas las rutas requieren sesión, excepto el inicio de sesión).
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { db, getSettings, saveSettings, listGallery, listFaqs, CATEGORY_IDS } from '../db.js';
import { config, paths } from '../config.js';
import {
  SESSION_COOKIE, verifyCredentials, createSession, destroySession, isValidSession, cookieOptions, requireAdmin,
} from '../lib/auth.js';
import { upload, assertImages, saveImage, deleteStoredFile, safeName } from '../lib/uploads.js';
import { clean, ORDER_STATUSES } from '../lib/validate.js';

const router = Router();
const GALLERY_MEDIA_PREFIX = '/media/gallery/';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
});

// --- Sesión --------------------------------------------------------------------
router.post('/login', loginLimiter, (req, res) => {
  if (!config.admin.passwordHash) {
    return res.status(503).json({ error: 'El panel no está configurado: falta ADMIN_PASSWORD_HASH en el servidor.' });
  }
  const { username, password } = req.body || {};
  if (!verifyCredentials(username, password)) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  const { token, expires } = createSession();
  res.cookie(SESSION_COOKIE, token, cookieOptions(expires));
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ authenticated: isValidSession(req.cookies?.[SESSION_COOKIE]), configured: !!config.admin.passwordHash });
});

router.use(requireAdmin);

const idParam = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// --- Pedidos ------------------------------------------------------------------
router.get('/stats', (req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all();
  res.json({
    orders: Object.fromEntries(rows.map((r) => [r.status, r.n])),
    gallery: db.prepare('SELECT COUNT(*) AS n FROM gallery_items').get().n,
    faqs: db.prepare('SELECT COUNT(*) AS n FROM faqs').get().n,
  });
});

router.get('/orders', (req, res) => {
  const status = clean(req.query.status, 30);
  const q = clean(req.query.q, 80);
  const where = [];
  const args = [];
  if (status && ORDER_STATUSES.includes(status)) {
    where.push('status = ?');
    args.push(status);
  }
  if (q) {
    where.push('(name LIKE ? OR phone LIKE ? OR code LIKE ? OR theme LIKE ?)');
    args.push(...Array(4).fill(`%${q}%`));
  }
  const rows = db
    .prepare(
      `SELECT o.id, o.code, o.status, o.name, o.phone, o.product_type, o.theme, o.needed_date, o.created_at,
              (SELECT COUNT(*) FROM order_files f WHERE f.order_id = o.id) AS files
       FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY o.created_at DESC, o.id DESC LIMIT 500`
    )
    .all(...args);
  res.json({ orders: rows, statuses: ORDER_STATUSES });
});

router.get('/orders/:id', (req, res) => {
  const id = idParam(req.params.id);
  const order = id && db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const files = db.prepare('SELECT id, kind, filename, original, mime, size FROM order_files WHERE order_id = ?').all(id);
  res.json({ ...order, files: files.map((f) => ({ ...f, url: `/api/admin/files/${f.filename}` })), statuses: ORDER_STATUSES });
});

router.patch('/orders/:id', (req, res) => {
  const id = idParam(req.params.id);
  if (!id || !db.prepare('SELECT id FROM orders WHERE id = ?').get(id)) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const { status, admin_notes } = req.body || {};
  if (status !== undefined) {
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Estado no válido.' });
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  }
  if (admin_notes !== undefined) db.prepare('UPDATE orders SET admin_notes = ? WHERE id = ?').run(clean(admin_notes, 3000), id);
  res.json({ ok: true });
});

router.delete('/orders/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const files = db.prepare('SELECT filename FROM order_files WHERE order_id = ?').all(id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  for (const f of files) await deleteStoredFile(paths.orderUploads, f.filename);
  res.json({ ok: true });
});

// Archivos adjuntos de los pedidos: privados, solo con sesión.
router.get('/files/:filename', (req, res) => {
  const { filename } = req.params;
  if (!safeName(filename)) return res.status(400).end();
  const row = db.prepare('SELECT mime, original FROM order_files WHERE filename = ?').get(filename);
  if (!row) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=3600');
  res.type(row.mime);
  if (req.query.download) res.attachment(row.original || filename);
  res.sendFile(path.join(paths.orderUploads, filename));
});

// --- Galería ------------------------------------------------------------------
router.get('/gallery', (req, res) => res.json(listGallery({ includeHidden: true })));

function galleryFields(body, partial = false) {
  const out = {};
  const errors = [];
  if (!partial || body.title !== undefined) {
    out.title = clean(body.title, 120);
    if (out.title.length < 2) errors.push('Escribe un título.');
  }
  if (!partial || body.description !== undefined) out.description = clean(body.description, 600);
  if (!partial || body.category !== undefined) {
    out.category = clean(body.category, 40);
    if (!CATEGORY_IDS.includes(out.category)) errors.push('Categoría no válida.');
  }
  const bool = (v) => (v === true || v === 'true' || v === '1' || v === 'on' ? 1 : 0);
  if (!partial || body.featured !== undefined) out.featured = bool(body.featured);
  if (!partial || body.visible !== undefined) out.visible = body.visible === undefined ? 1 : bool(body.visible);
  if (body.sort !== undefined) out.sort = Number.parseInt(body.sort, 10) || 0;
  return { out, errors };
}

async function addPhotos(itemId, files) {
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM gallery_photos WHERE item_id = ?').get(itemId).m;
  let sort = maxSort;
  for (const f of files) {
    const saved = await saveImage(f, paths.galleryUploads);
    db.prepare('INSERT INTO gallery_photos (item_id, url, sort) VALUES (?, ?, ?)').run(itemId, GALLERY_MEDIA_PREFIX + saved.filename, ++sort);
  }
}

const galleryUpload = upload.array('photos', 8);

router.post('/gallery', galleryUpload, async (req, res, next) => {
  try {
    const { out, errors } = galleryFields(req.body);
    const files = req.files || [];
    if (!files.length) errors.push('Agrega al menos una foto.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    assertImages(files);
    const sort = out.sort ?? db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM gallery_items').get().s;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO gallery_items (title, description, category, featured, visible, sort) VALUES (?, ?, ?, ?, ?, ?)')
      .run(out.title, out.description, out.category, out.featured, out.visible, sort);
    await addPhotos(lastInsertRowid, files);
    res.status(201).json({ ok: true, id: Number(lastInsertRowid) });
  } catch (e) {
    next(e);
  }
});

router.patch('/gallery/:id', (req, res) => {
  const id = idParam(req.params.id);
  if (!id || !db.prepare('SELECT id FROM gallery_items WHERE id = ?').get(id)) return res.status(404).json({ error: 'Trabajo no encontrado.' });
  const { out, errors } = galleryFields(req.body || {}, true);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const keys = Object.keys(out);
  if (keys.length) {
    db.prepare(`UPDATE gallery_items SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => out[k]), id);
  }
  res.json({ ok: true });
});

router.post('/gallery/:id/photos', galleryUpload, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    if (!id || !db.prepare('SELECT id FROM gallery_items WHERE id = ?').get(id)) return res.status(404).json({ error: 'Trabajo no encontrado.' });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Selecciona al menos una foto.' });
    assertImages(files);
    await addPhotos(id, files);
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const removeGalleryFile = (url) =>
  url.startsWith(GALLERY_MEDIA_PREFIX) ? deleteStoredFile(paths.galleryUploads, url.slice(GALLERY_MEDIA_PREFIX.length)) : null;

router.delete('/gallery/photos/:photoId', async (req, res) => {
  const id = idParam(req.params.photoId);
  const photo = id && db.prepare('SELECT url FROM gallery_photos WHERE id = ?').get(id);
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada.' });
  db.prepare('DELETE FROM gallery_photos WHERE id = ?').run(id);
  await removeGalleryFile(photo.url);
  res.json({ ok: true });
});

router.delete('/gallery/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(404).json({ error: 'Trabajo no encontrado.' });
  const photos = db.prepare('SELECT url FROM gallery_photos WHERE item_id = ?').all(id);
  db.prepare('DELETE FROM gallery_items WHERE id = ?').run(id);
  for (const p of photos) await removeGalleryFile(p.url);
  res.json({ ok: true });
});

// --- Información del negocio -------------------------------------------------------
router.get('/settings', (req, res) => res.json(getSettings()));

router.put('/settings', (req, res) => {
  const body = { ...(req.body || {}) };
  if ('whatsapp' in body) {
    body.whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
    if (body.whatsapp && (body.whatsapp.length < 10 || body.whatsapp.length > 15)) {
      return res.status(400).json({ error: 'El WhatsApp debe incluir código de país y número (10 a 15 dígitos). Ej.: 52 + 10 dígitos.' });
    }
  }
  for (const k of ['facebook', 'instagram', 'tiktok']) {
    if (body[k] && !/^https:\/\/[^\s]+$/.test(String(body[k]).trim())) {
      return res.status(400).json({ error: `El enlace de ${k} debe empezar con https://` });
    }
  }
  saveSettings(body);
  res.json({ ok: true, settings: getSettings() });
});

// --- Preguntas frecuentes del asistente -----------------------------------------------
router.get('/faqs', (req, res) => res.json(listFaqs({ includeHidden: true })));

function faqFields(body) {
  const out = {
    question: clean(body.question, 200),
    answer: clean(body.answer, 1500),
    keywords: clean(body.keywords, 400),
    visible: body.visible === false || body.visible === 'false' ? 0 : 1,
  };
  const error = out.question.length < 3 || out.answer.length < 3 ? 'Escribe la pregunta y la respuesta.' : null;
  return { out, error };
}

router.post('/faqs', (req, res) => {
  const { out, error } = faqFields(req.body || {});
  if (error) return res.status(400).json({ error });
  const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM faqs').get().s;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO faqs (question, answer, keywords, visible, sort) VALUES (?, ?, ?, ?, ?)')
    .run(out.question, out.answer, out.keywords, out.visible, sort);
  res.status(201).json({ ok: true, id: Number(lastInsertRowid) });
});

router.put('/faqs/:id', (req, res) => {
  const id = idParam(req.params.id);
  const { out, error } = faqFields(req.body || {});
  if (error) return res.status(400).json({ error });
  const r = db
    .prepare('UPDATE faqs SET question = ?, answer = ?, keywords = ?, visible = ? WHERE id = ?')
    .run(out.question, out.answer, out.keywords, out.visible, id);
  if (!r.changes) return res.status(404).json({ error: 'Pregunta no encontrada.' });
  res.json({ ok: true });
});

router.delete('/faqs/:id', (req, res) => {
  db.prepare('DELETE FROM faqs WHERE id = ?').run(idParam(req.params.id));
  res.json({ ok: true });
});

// --- Código QR ------------------------------------------------------------------
router.get('/site-url', (req, res) => res.json({ siteUrl: config.siteUrl }));

export default router;
