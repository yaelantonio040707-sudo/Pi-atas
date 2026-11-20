// Base de datos SQLite (módulo nativo node:sqlite, sin dependencias compiladas).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(paths.orderUploads, { recursive: true });
fs.mkdirSync(paths.galleryUploads, { recursive: true });

export const db = new DatabaseSync(paths.db);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS gallery_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL,
  featured    INTEGER NOT NULL DEFAULT 0,
  visible     INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id  INTEGER NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  url      TEXT NOT NULL,
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'nuevo',
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  product_type  TEXT NOT NULL,
  product_other TEXT NOT NULL DEFAULT '',
  size          TEXT NOT NULL DEFAULT '',
  theme         TEXT NOT NULL DEFAULT '',
  colors        TEXT NOT NULL DEFAULT '',
  quantity      INTEGER NOT NULL DEFAULT 1,
  needed_date   TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  budget        TEXT NOT NULL DEFAULT '',
  admin_notes   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_files (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id  INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,           -- 'referencia' | 'boceto'
  filename  TEXT NOT NULL,           -- nombre en disco (aleatorio)
  original  TEXT NOT NULL DEFAULT '',
  mime      TEXT NOT NULL,
  size      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS faqs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  question  TEXT NOT NULL,
  answer    TEXT NOT NULL,
  keywords  TEXT NOT NULL DEFAULT '',
  visible   INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Solicitudes de derechos ARCO (acceso, rectificación, cancelación, oposición, revocación, limitación)
CREATE TABLE IF NOT EXISTS arco_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'recibida',
  name         TEXT NOT NULL,
  contact      TEXT NOT NULL,
  right_type   TEXT NOT NULL,
  order_code   TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL,
  admin_notes  TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT
);
`);

/** Agrega una columna si no existe (actualiza bases de datos creadas con versiones anteriores). */
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
// Consentimiento registrado con cada pedido
ensureColumn('orders', 'privacy_accepted_at', "TEXT NOT NULL DEFAULT ''");
ensureColumn('orders', 'privacy_version', "TEXT NOT NULL DEFAULT ''");
ensureColumn('orders', 'allow_publish', 'INTEGER NOT NULL DEFAULT 0');

/** Ejecuta fn dentro de una transacción. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const seedDir = path.join(config.root, 'server', 'seed');
const readSeed = (f) => JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));

// --- Datos iniciales (solo la primera vez) -----------------------------------
function seed() {
  const settings = readSeed('settings.json');
  if (config.defaults.whatsapp) settings.whatsapp = config.defaults.whatsapp;
  const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(settings)) insSetting.run(k, String(v));

  const galleryCount = db.prepare('SELECT COUNT(*) AS n FROM gallery_items').get().n;
  if (galleryCount === 0) {
    const insItem = db.prepare(
      'INSERT INTO gallery_items (title, description, category, featured, sort) VALUES (?, ?, ?, ?, ?)'
    );
    const insPhoto = db.prepare('INSERT INTO gallery_photos (item_id, url, sort) VALUES (?, ?, ?)');
    tx(() => {
      readSeed('gallery.json').forEach((it, i) => {
        const { lastInsertRowid } = insItem.run(it.title, it.description, it.category, it.featured ? 1 : 0, i);
        for (let p = 1; p <= it.photos; p++) {
          insPhoto.run(lastInsertRowid, `/img/gallery/${it.slug}-${p}.jpg`, p);
        }
      });
    });
  }

  const faqCount = db.prepare('SELECT COUNT(*) AS n FROM faqs').get().n;
  const insFaq = db.prepare('INSERT INTO faqs (question, answer, keywords, sort) VALUES (?, ?, ?, ?)');
  if (faqCount === 0) {
    tx(() => readSeed('faqs.json').forEach((f, i) => insFaq.run(f.question, f.answer, f.keywords, i)));
  }
  // Preguntas sobre privacidad, pagos y garantías: se agregan una sola vez (también en bases existentes).
  const legalSeeded = db.prepare("SELECT value FROM settings WHERE key = '_seedLegalFaqs'").get();
  if (!legalSeeded) {
    tx(() => {
      readSeed('faqs-legal.json').forEach((f, i) => insFaq.run(f.question, f.answer, f.keywords, 100 + i));
      db.prepare("INSERT INTO settings (key, value) VALUES ('_seedLegalFaqs', '1')").run();
    });
  }
}
seed();

// --- Acceso a ajustes ---------------------------------------------------------
export const SETTING_KEYS = Object.keys(readSeed('settings.json'));

export function getSettings() {
  const out = {};
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) out[key] = value;
  return out;
}

export function saveSettings(values) {
  const up = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  tx(() => {
    for (const k of SETTING_KEYS) if (k in values) up.run(k, String(values[k] ?? '').trim().slice(0, 2000));
  });
}

// --- Galería -------------------------------------------------------------------
export const CATEGORIES = [
  { id: 'personajes', name: 'Personajes animados' },
  { id: 'animales', name: 'Animales' },
  { id: 'tradicionales', name: 'Tradicionales' },
  { id: 'personalizados', name: 'Diseños personalizados' },
  { id: 'sombreros', name: 'Sombreros' },
  { id: 'accesorios', name: 'Accesorios' },
  { id: 'decoraciones', name: 'Decoraciones' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function listGallery({ includeHidden = false } = {}) {
  const items = db
    .prepare(
      `SELECT id, title, description, category, featured, visible, sort FROM gallery_items
       ${includeHidden ? '' : 'WHERE visible = 1'} ORDER BY sort, id`
    )
    .all();
  const photos = db.prepare('SELECT id, item_id, url FROM gallery_photos ORDER BY sort, id').all();
  const byItem = new Map(items.map((it) => [it.id, { ...it, featured: !!it.featured, visible: !!it.visible, photos: [] }]));
  for (const p of photos) byItem.get(p.item_id)?.photos.push({ id: p.id, url: p.url });
  return [...byItem.values()];
}

export function listFaqs({ includeHidden = false } = {}) {
  return db
    .prepare(`SELECT id, question, answer, keywords, visible, sort FROM faqs ${includeHidden ? '' : 'WHERE visible = 1'} ORDER BY sort, id`)
    .all()
    .map((f) => ({ ...f, visible: !!f.visible }));
}
