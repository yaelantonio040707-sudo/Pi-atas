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
process.env.ORDER_RATE_LIMIT = '50';

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
    quantity: '1', needed_date: future, started_at: String(Date.now() - 10_000), website: '', accept_privacy: '1', ...overrides,
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

test('exige aceptar el aviso de privacidad', async () => {
  const fd = orderForm();
  fd.delete('accept_privacy');
  const res = await fetch(`${base}/api/orders`, { method: 'POST', body: fd });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).fields.accept_privacy);
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
  const fd = orderForm({ colors: 'verde y morado', description: 'Que diga "Mateo"', allow_publish: '1' });
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
  assert.ok(detail.privacy_accepted_at, 'registra la fecha de aceptación del aviso');
  assert.equal(detail.allow_publish, 1);
  const exp = await fetch(`${base}/api/admin/orders/${order.id}/export`, { headers: h });
  assert.equal(exp.status, 200);
  const data = await exp.json();
  assert.equal(data.solicitud.code, orderCode);
  assert.ok(!('admin_notes' in data.solicitud));

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
  assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /aviso-de-privacidad/);
});

test('páginas legales con datos pendientes visibles y luego completos', async () => {
  for (const p of ['/aviso-de-privacidad', '/terminos-y-condiciones', '/devoluciones-y-garantias', '/derechos-arco']) {
    const res = await fetch(`${base}${p}`);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-type'), /text\/html/);
  }
  let html = await (await fetch(`${base}/aviso-de-privacidad`)).text();
  assert.match(html, /\[Pendiente: domicilio completo del responsable\]/);
  assert.match(html, /20 días/);
  assert.match(html, /Secretaría Anticorrupción y Buen Gobierno/);

  const login = await fetch(`${base}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'clave-de-prueba' }),
  });
  const h = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-Requested-With': 'keflita-admin', 'Content-Type': 'application/json' };
  const bad = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: h, body: JSON.stringify({ privacyEmail: 'no-es-correo' }) });
  assert.equal(bad.status, 400);
  const ok = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: h, body: JSON.stringify({
    legalName: 'Persona de Prueba', legalAddress: 'Calle Falsa 123, Col. Centro, CP 00000', privacyEmail: 'privacidad@ejemplo.test',
    paymentInfo: 'Efectivo', depositInfo: 'Anticipo del 50%', deliveryInfo: 'Recolección', shippingInfo: 'Se cotiza', leadTimeInfo: '1 semana', returnsDays: '3',
  }) });
  assert.equal(ok.status, 200);
  html = await (await fetch(`${base}/aviso-de-privacidad`)).text();
  assert.doesNotMatch(html, /Pendiente/);
  assert.match(html, /Persona de Prueba/);
  assert.match(await (await fetch(`${base}/devoluciones-y-garantias`)).text(), /3 días naturales/);
  const checklist = await (await fetch(`${base}/api/admin/compliance`, { headers: h })).json();
  assert.ok(checklist.flatMap((g) => g.items).every((i) => i.ok), 'todo el checklist en verde');
  // Escapa HTML capturado en el panel
  await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: h, body: JSON.stringify({ legalName: '<script>x</script>' }) });
  assert.doesNotMatch(await (await fetch(`${base}/terminos-y-condiciones`)).text(), /<script>x/);
});

test('formulario ARCO sin JavaScript: valida, registra y aparece en el panel', async () => {
  const post = (fields) => fetch(`${base}/derechos-arco`, {
    method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ website: '', started_at: String(Date.now() - 10_000), ...fields }),
  });
  const invalid = await post({ name: 'Ana', contact: '5512345678', right_type: 'Inventado', description: 'Quiero mis datos', is_owner: '1' });
  assert.equal(invalid.status, 400);
  assert.match(await invalid.text(), /Selecciona el derecho/);
  const res = await post({ name: 'Ana López', contact: '5512345678', right_type: 'Cancelación', description: 'Eliminen mi pedido y fotos', is_owner: '1' });
  assert.equal(res.status, 303);
  const folio = new URL(res.headers.get('location'), base).searchParams.get('folio');
  assert.match(folio, /^ARCO-/);
  assert.match(await (await fetch(`${base}/derechos-arco?folio=${folio}`)).text(), new RegExp(folio));

  const login = await fetch(`${base}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'clave-de-prueba' }),
  });
  const h = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-Requested-With': 'keflita-admin', 'Content-Type': 'application/json' };
  const { requests } = await (await fetch(`${base}/api/admin/arco`, { headers: h })).json();
  const r = requests.find((x) => x.code === folio);
  assert.equal(r.status, 'recibida');
  assert.equal((await (await fetch(`${base}/api/admin/stats`, { headers: h })).json()).arcoOpen, 1);
  await fetch(`${base}/api/admin/arco/${r.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'atendida' }) });
  assert.equal((await (await fetch(`${base}/api/admin/stats`, { headers: h })).json()).arcoOpen, 0);
});

test('elimina automáticamente solicitudes concluidas que superan el plazo de conservación', async () => {
  const { db } = await import('../server/db.js');
  const { purgeExpiredOrders } = await import('../server/services/retention.js');
  db.prepare(`INSERT INTO orders (code, status, name, phone, product_type, theme, needed_date, created_at)
              VALUES ('KF-OLD-1', 'entregado', 'Viejo', '5512345678', 'Piñata', 'x', '2020-01-01', datetime('now', '-13 months'))`).run();
  db.prepare(`INSERT INTO orders (code, status, name, phone, product_type, theme, needed_date, created_at)
              VALUES ('KF-OLD-2', 'nuevo', 'Pendiente', '5512345678', 'Piñata', 'x', '2020-01-01', datetime('now', '-13 months'))`).run();
  assert.equal(await purgeExpiredOrders(), 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE code = 'KF-OLD-1'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE code = 'KF-OLD-2'").get().n, 1, 'no borra solicitudes abiertas');
});
