// Pruebas de la API con una base de datos temporal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keflita-test-'));
const salt = 'testsalt';
process.env.DATA_DIR = tmp;
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD_HASH = `scrypt$${salt}$${crypto.scryptSync('clave-de-prueba', salt, 64).toString('hex')}`;
process.env.ANTHROPIC_API_KEY = '';
process.env.SITE_URL = 'https://ejemplo-keflita.test';

let server;
let base;
before(async () => {
  const { createApp } = await import('../server/app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// PNG mínimo válido (1x1)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

function orderForm(overrides = {}) {
  const fd = new FormData();
  const fields = {
    name: 'Cliente Prueba', phone: '55 1234 5678', product_type: 'Piñata', theme: 'Número 3 con dinosaurio',
    quantity: '1', needed_date: future, started_at: String(Date.now() - 10_000), website: '', ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

test('información pública del sitio y galería', async () => {
  const site = await (await fetch(`${base}/api/site`)).json();
  assert.equal(site.businessName, 'Keflita');
  assert.equal(site.aiEnabled, false);
  assert.ok(!('leadTimeInfoSecret' in site));
  const gallery = await (await fetch(`${base}/api/gallery`)).json();
  assert.equal(gallery.length, 18);
  assert.ok(gallery.every((g) => g.photos.length >= 1));
  const img = await fetch(`${base}${gallery[0].photos[0].url}`);
  assert.equal(img.status, 200);
});

test('rechaza pedidos inválidos con mensajes por campo', async () => {
  const res = await fetch(`${base}/api/orders`, { method: 'POST', body: orderForm({ name: '', phone: '12', needed_date: '2000-01-01' }) });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.ok(body.fields.name && body.fields.phone && body.fields.needed_date);
});

test('bloquea envíos de bots (campo trampa / envío instantáneo)', async () => {
  let res = await fetch(`${base}/api/orders`, { method: 'POST', body: orderForm({ website: 'http://spam' }) });
  assert.equal(res.status, 400);
  res = await fetch(`${base}/api/orders`, { method: 'POST', body: orderForm({ started_at: String(Date.now()) }) });
  assert.equal(res.status, 400);
});

test('rechaza archivos que no son imágenes', async () => {
  const fd = orderForm();
  fd.append('references', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'falso.png');
  const res = await fetch(`${base}/api/orders`, { method: 'POST', body: fd });
  assert.equal(res.status, 400);
});

let orderCode;
test('acepta un pedido válido con referencia y boceto', async () => {
  const fd = orderForm({ colors: 'verde y morado', description: 'Que diga "Mateo"' });
  fd.append('references', new Blob([PNG], { type: 'image/png' }), 'ref.png');
  fd.append('sketch', new Blob([PNG], { type: 'image/png' }), 'boceto.png');
  const res = await fetch(`${base}/api/orders`, { method: 'POST', body: fd });
  assert.equal(res.status, 201);
  orderCode = (await res.json()).code;
  assert.match(orderCode, /^KF-\d{6}-[0-9A-F]{4}$/);
});

test('el chat responde con preguntas frecuentes sin IA y nunca da precios', async () => {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '¿Cuánto cuesta una piñata?' }),
  });
  const body = await res.json();
  assert.equal(body.source, 'faq');
  assert.match(body.reply, /no manejamos precios fijos/i);
  assert.doesNotMatch(body.reply, /\$\s?\d/);
});

test('el panel exige autenticación', async () => {
  assert.equal((await fetch(`${base}/api/admin/orders`)).status, 401);
  const bad = await fetch(`${base}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'x' }),
  });
  assert.equal(bad.status, 401);
});

test('flujo del panel: pedidos, archivos privados, ajustes y protección CSRF', async () => {
  const login = await fetch(`${base}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'clave-de-prueba' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const h = { Cookie: cookie, 'X-Requested-With': 'keflita-admin' };

  const { orders } = await (await fetch(`${base}/api/admin/orders`, { headers: h })).json();
  const order = orders.find((o) => o.code === orderCode);
  assert.ok(order);
  const detail = await (await fetch(`${base}/api/admin/orders/${order.id}`, { headers: h })).json();
  assert.equal(detail.files.length, 2);

  // Archivos: solo con sesión
  assert.equal((await fetch(`${base}${detail.files[0].url}`)).status, 401);
  assert.equal((await fetch(`${base}${detail.files[0].url}`, { headers: h })).status, 200);

  // Sin cabecera propia se rechaza la modificación (CSRF)
  const noHeader = await fetch(`${base}/api/admin/orders/${order.id}`, {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cotizado' }),
  });
  assert.equal(noHeader.status, 403);
  const ok = await fetch(`${base}/api/admin/orders/${order.id}`, {
    method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cotizado', admin_notes: 'Cotización enviada' }),
  });
  assert.equal(ok.status, 200);

  // Ajustes: WhatsApp aparece en el sitio público
  const put = await fetch(`${base}/api/admin/settings`, {
    method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ whatsapp: '+52 55 1234 5678' }),
  });
  assert.equal(put.status, 200);
  assert.equal((await (await fetch(`${base}/api/site`)).json()).whatsapp, '525512345678');

  // Galería: crear trabajo con foto y verlo publicado
  const fd = new FormData();
  fd.append('title', 'Trabajo de prueba');
  fd.append('category', 'animales');
  fd.append('photos', new Blob([PNG], { type: 'image/png' }), 'nuevo.png');
  const created = await fetch(`${base}/api/admin/gallery`, { method: 'POST', headers: h, body: fd });
  assert.equal(created.status, 201);
  const pub = await (await fetch(`${base}/api/gallery`)).json();
  const item = pub.find((g) => g.title === 'Trabajo de prueba');
  assert.equal((await fetch(`${base}${item.photos[0].url}`)).status, 200);

  // QR disponible con SITE_URL
  const qr = await fetch(`${base}/api-qr-no-existe`);
  assert.equal(qr.status, 404);
  const qrOk = await fetch(`${base}/api/admin-qr.png?size=300`, { headers: h });
  assert.equal(qrOk.headers.get('content-type'), 'image/png');

  const logout = await fetch(`${base}/api/admin/logout`, { method: 'POST', headers: h });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${base}/api/admin/orders`, { headers: h })).status, 401);
});

test('SEO: robots y sitemap', async () => {
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap: https:\/\/ejemplo-keflita.test\/sitemap.xml/);
  assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /<loc>https:\/\/ejemplo-keflita.test\/<\/loc>/);
});
