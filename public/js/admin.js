// Panel de administración de Keflita.
import { $, $$, el, toast, whatsappLink, formatDate } from './utils.js';

const HEADERS = { 'X-Requested-With': 'keflita-admin' };
let categories = [];

async function call(url, { method = 'GET', json, form } = {}) {
  const opts = { method, headers: { ...HEADERS }, credentials: 'same-origin' };
  if (json !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(json); }
  if (form) opts.body = form;
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error('Tu sesión expiró.'); }
  if (!res.ok) throw new Error(data?.error || 'Ocurrió un error.');
  return data;
}

// --- Sesión ----------------------------------------------------------------
function showLogin(note) {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  if (note) $('#login-note').textContent = note;
  $('#l-user').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    await call('/api/admin/login', { method: 'POST', json: Object.fromEntries(new FormData(e.target)) });
    e.target.reset();
    startApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await call('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showLogin('Cerraste sesión.');
});

// --- Pestañas --------------------------------------------------------------
const loaders = {};
$$('.admin-tabs [data-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    $$('.admin-tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    loaders[b.dataset.tab]?.();
  }));

// --- Pedidos ---------------------------------------------------------------
let statuses = [];
let selectedOrder = null;
const statusBadge = (s) => el('span', { class: `status status-${s.replace(/\s+/g, '-')}` }, s);
const fmtDateTime = (s) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

async function loadOrders() {
  const params = new URLSearchParams({ q: $('#order-search').value, status: $('#order-status').value });
  const data = await call(`/api/admin/orders?${params}`);
  statuses = data.statuses;
  const sel = $('#order-status');
  if (sel.options.length === 1) sel.append(...statuses.map((s) => el('option', { value: s }, s)));
  const list = $('#order-list');
  list.replaceChildren(...data.orders.map((o) =>
    el('button', { type: 'button', class: 'order-row', 'aria-current': String(o.id === selectedOrder), onclick: () => openOrder(o.id) },
      el('span', { class: 'top' }, el('span', {}, o.name), statusBadge(o.status)),
      el('span', {}, `${o.product_type} · ${o.theme}`),
      el('span', { class: 'meta' }, `${o.code} · Para: ${o.needed_date}${o.files ? ` · 📎 ${o.files}` : ''}`))));
  if (!data.orders.length) list.append(el('p', { class: 'muted' }, 'No hay solicitudes con estos filtros.'));
  await refreshCounts();
}
loaders.orders = loadOrders;
let searchTimer;
$('#order-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadOrders, 300); });
$('#order-status').addEventListener('change', loadOrders);

async function openOrder(id) {
  selectedOrder = id;
  $$('.order-row').forEach((r) => r.setAttribute('aria-current', 'false'));
  const o = await call(`/api/admin/orders/${id}`);
  const rows = [
    ['Folio', o.code], ['Recibido', fmtDateTime(o.created_at)], ['Nombre', o.name], ['Teléfono', o.phone],
    ['Producto', o.product_type === 'Otro' ? `Otro: ${o.product_other}` : o.product_type], ['Personaje / temática', o.theme],
    ['Tamaño', o.size], ['Colores', o.colors], ['Cantidad', o.quantity], ['Fecha requerida', formatDate(o.needed_date)],
    ['Presupuesto', o.budget], ['Descripción', o.description],
    ['Aviso de privacidad', o.privacy_accepted_at ? `Aceptado el ${fmtDateTime(o.privacy_accepted_at)} (versión ${o.privacy_version || '—'})` : 'Sin registro (solicitud anterior al aviso)'],
    ['Publicar fotos', o.allow_publish ? 'Sí, el cliente lo autorizó' : 'No autorizado'],
  ].filter(([, v]) => String(v ?? '').trim());

  const digits = o.phone.replace(/\D/g, '');
  const waNumber = digits.length === 10 ? `52${digits}` : digits; // 10 dígitos: se asume número de México
  const wa = whatsappLink(waNumber, `¡Hola, ${o.name}! Te escribimos de Keflita sobre tu solicitud ${o.code} (${o.theme}).`);

  const statusSel = el('select', { 'aria-label': 'Estado del pedido' }, statuses.map((s) => el('option', { value: s, selected: s === o.status }, s)));
  const notes = el('textarea', { rows: 4, placeholder: 'Notas internas: cotización enviada, anticipo, cambios acordados…' });
  notes.value = o.admin_notes;

  $('#order-detail').replaceChildren(
    el('h2', {}, `${o.name}`), statusBadge(o.status),
    el('div', { class: 'quick-contact' },
      wa ? el('a', { class: 'btn btn-whatsapp btn-sm', href: wa, target: '_blank', rel: 'noopener' }, 'WhatsApp') : null,
      el('a', { class: 'btn btn-ghost btn-sm', href: `tel:${o.phone.replace(/[^\d+]/g, '')}` }, 'Llamar'),
      el('a', { class: 'btn btn-ghost btn-sm', href: `/api/admin/orders/${o.id}/export`, title: 'Para responder solicitudes de acceso (ARCO)' }, 'Descargar datos')),
    el('dl', { class: 'detail-grid' }, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))])),
    o.files.length ? el('h3', {}, 'Imágenes adjuntas') : null,
    o.files.length ? el('div', { class: 'attach' }, o.files.map((f) =>
      el('a', { href: f.url, target: '_blank', rel: 'noopener' }, el('img', { src: f.url, alt: f.kind, loading: 'lazy' }), el('span', {}, f.kind === 'boceto' ? '✏️ Boceto' : '📷 Referencia')))) : null,
    el('h3', {}, 'Seguimiento'),
    el('div', { class: 'field' }, el('label', {}, 'Estado'), statusSel),
    el('div', { class: 'field' }, el('label', {}, 'Notas internas'), notes),
    el('div', { class: 'row-actions' },
      el('button', { class: 'btn btn-danger', onclick: async () => {
        if (!confirm(`¿Eliminar definitivamente la solicitud ${o.code} y sus imágenes?`)) return;
        await call(`/api/admin/orders/${o.id}`, { method: 'DELETE' });
        selectedOrder = null;
        $('#order-detail').replaceChildren(el('p', { class: 'muted center' }, 'Solicitud eliminada.'));
        loadOrders();
      } }, 'Eliminar'),
      el('button', { class: 'btn btn-primary', onclick: async () => {
        await call(`/api/admin/orders/${o.id}`, { method: 'PATCH', json: { status: statusSel.value, admin_notes: notes.value } });
        toast('Cambios guardados');
        loadOrders();
        openOrder(o.id);
      } }, 'Guardar')),
  );
  loadOrders();
}

// --- Galería ---------------------------------------------------------------
const catOptions = (selected) => categories.map((c) => el('option', { value: c.id, selected: c.id === selected }, c.name));

async function loadGallery() {
  const items = await call('/api/admin/gallery');
  $('#works').replaceChildren(...items.map(workCard));
}
loaders.gallery = loadGallery;

function workCard(it) {
  const fileInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true });
  fileInput.addEventListener('change', async () => {
    const fd = new FormData();
    [...fileInput.files].forEach((f) => fd.append('photos', f));
    try { await call(`/api/admin/gallery/${it.id}/photos`, { method: 'POST', form: fd }); toast('Fotos agregadas'); loadGallery(); } catch (e) { toast(e.message); }
  });
  const form = el('form', {},
    el('input', { type: 'text', name: 'title', value: it.title, 'aria-label': 'Título', maxlength: 120 }),
    el('select', { name: 'category', 'aria-label': 'Categoría' }, catOptions(it.category)),
    el('textarea', { name: 'description', 'aria-label': 'Descripción', maxlength: 600 }, it.description),
    el('div', {},
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'visible', checked: it.visible }), 'Visible'),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'featured', checked: it.featured }), 'Destacado'),
      el('label', { class: 'check' }, 'Orden ', el('input', { type: 'number', name: 'sort', value: it.sort, class: 'sort-input', style: 'width:70px;min-height:36px;padding:.3em .5em' }))),
    el('div', { class: 'row-actions' },
      el('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: async () => {
        if (!confirm(`¿Eliminar "${it.title}" y todas sus fotos?`)) return;
        await call(`/api/admin/gallery/${it.id}`, { method: 'DELETE' });
        toast('Trabajo eliminado');
        loadGallery();
      } }, 'Eliminar'),
      el('button', { class: 'btn btn-primary btn-sm' }, 'Guardar')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await call(`/api/admin/gallery/${it.id}`, { method: 'PATCH', json: {
        title: f.title.value, category: f.category.value, description: f.description.value,
        visible: f.visible.checked, featured: f.featured.checked, sort: f.sort.value,
      } });
      toast('Trabajo actualizado');
      loadGallery();
    } catch (err) { toast(err.message); }
  });
  return el('article', { class: `work-admin${it.visible ? '' : ' hidden-item'}` },
    el('div', { class: 'work-photos' },
      it.photos.map((p) => el('figure', {},
        el('img', { src: p.url, alt: '' }),
        el('button', { type: 'button', 'aria-label': 'Eliminar foto', onclick: async () => {
          if (!confirm('¿Eliminar esta foto?')) return;
          await call(`/api/admin/gallery/photos/${p.id}`, { method: 'DELETE' });
          loadGallery();
        } }, '✕'))),
      el('label', { class: 'add-photo' }, fileInput, '+ Foto')),
    form);
}

$('#new-work').addEventListener('click', () => { $('#work-form').hidden = false; $('#w-title').focus(); });
$('#cancel-work').addEventListener('click', () => { $('#work-form').hidden = true; });
$('#work-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#work-error').textContent = '';
  try {
    await call('/api/admin/gallery', { method: 'POST', form: new FormData(e.target) });
    e.target.reset();
    e.target.hidden = true;
    toast('Trabajo agregado a la galería');
    loadGallery();
  } catch (err) { $('#work-error').textContent = err.message; }
});

// --- Negocio ---------------------------------------------------------------
async function loadSettings() {
  const s = await call('/api/admin/settings');
  const f = $('#settings-form');
  for (const [k, v] of Object.entries(s)) if (f.elements[k]) f.elements[k].value = v;
}
loaders.business = loadSettings;
$('#settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#settings-error').textContent = '';
  try {
    await call('/api/admin/settings', { method: 'PUT', json: Object.fromEntries(new FormData(e.target)) });
    toast('Información guardada');
    loadSettings();
  } catch (err) { $('#settings-error').textContent = err.message; }
});

// --- Preguntas frecuentes -------------------------------------------------
function faqCard(f = { question: '', answer: '', keywords: '', visible: true }) {
  const form = el('form', { class: 'admin-card faq-admin' },
    el('label', {}, 'Pregunta', el('input', { type: 'text', name: 'question', value: f.question, maxlength: 200 })),
    el('label', {}, 'Respuesta', el('textarea', { name: 'answer', maxlength: 1500 }, f.answer)),
    el('label', {}, 'Palabras clave (separadas por coma, para el modo sin IA)', el('input', { type: 'text', name: 'keywords', value: f.keywords, maxlength: 400 })),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'visible', checked: f.visible }), 'Mostrar en el sitio'),
    el('div', { class: 'row-actions' },
      f.id ? el('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: async () => {
        if (!confirm('¿Eliminar esta pregunta?')) return;
        await call(`/api/admin/faqs/${f.id}`, { method: 'DELETE' });
        loadFaqs();
      } }, 'Eliminar') : el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => form.remove() }, 'Cancelar'),
      el('button', { class: 'btn btn-primary btn-sm' }, 'Guardar')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = e.target;
    const json = { question: t.question.value, answer: t.answer.value, keywords: t.keywords.value, visible: t.visible.checked };
    try {
      await call(f.id ? `/api/admin/faqs/${f.id}` : '/api/admin/faqs', { method: f.id ? 'PUT' : 'POST', json });
      toast('Pregunta guardada');
      loadFaqs();
    } catch (err) { toast(err.message); }
  });
  return form;
}
async function loadFaqs() {
  const [faqs, site] = await Promise.all([call('/api/admin/faqs'), call('/api/site')]);
  $('#ai-status').textContent = site.aiEnabled
    ? 'El asistente usa inteligencia artificial y se basa en estas preguntas y en la información del negocio.'
    : 'El asistente funciona en modo de respuestas predefinidas (no hay clave de IA configurada): responde con estas preguntas según las palabras clave.';
  $('#faqs').replaceChildren(...faqs.map(faqCard));
}
loaders.faqs = loadFaqs;
$('#new-faq').addEventListener('click', () => { const c = faqCard(); $('#faqs').prepend(c); c.querySelector('input').focus(); });

// --- Privacidad y legal ----------------------------------------------------
const DAY = 864e5;
async function loadPrivacy() {
  const [groups, arco] = await Promise.all([call('/api/admin/compliance'), call('/api/admin/arco')]);
  $('#compliance').replaceChildren(...groups.map((g) =>
    el('div', { class: 'check-group' },
      el('h3', {}, g.group),
      el('ul', { class: 'checklist' }, g.items.map((it) =>
        el('li', { class: it.ok ? 'ok' : 'missing' },
          el('span', { 'aria-hidden': 'true' }, it.ok ? '✅' : '⚠️'),
          el('span', {}, it.label, it.ok ? '' : el('span', { class: 'sr-only' }, ' (pendiente)')),
          !it.ok && it.field ? el('button', { type: 'button', class: 'link-btn', onclick: () => goToField(it.field) }, 'Completar') : null))))));

  const list = $('#arco-list');
  if (!arco.requests.length) { list.replaceChildren(el('p', { class: 'muted' }, 'No hay solicitudes ARCO.')); return; }
  list.replaceChildren(...arco.requests.map((r) => {
    const received = new Date(`${r.created_at.replace(' ', 'T')}Z`);
    const due = new Date(received.getTime() + 20 * DAY);
    const open = !['atendida', 'improcedente'].includes(r.status);
    const left = Math.ceil((due - Date.now()) / DAY);
    const statusSel = el('select', { 'aria-label': 'Estado' }, arco.statuses.map((s) => el('option', { value: s, selected: s === r.status }, s)));
    const notes = el('textarea', { rows: 3, placeholder: 'Notas: verificación de identidad, respuesta enviada, fecha…' });
    notes.value = r.admin_notes;
    return el('article', { class: 'arco-item' },
      el('div', { class: 'arco-top' },
        el('strong', {}, `${r.right_type} · ${r.name}`),
        statusBadge(r.status),
        open ? el('span', { class: `due ${left <= 5 ? 'due-soon' : ''}` }, left >= 0 ? `Responder antes del ${due.toLocaleDateString('es-MX')} (${left} días)` : `Plazo vencido el ${due.toLocaleDateString('es-MX')}`) : null),
      el('p', { class: 'meta' }, `${r.code} · Recibida ${fmtDateTime(r.created_at)} · Contacto: ${r.contact}${r.order_code ? ` · Pedido: ${r.order_code}` : ''}`),
      el('p', { class: 'arco-desc' }, r.description),
      el('div', { class: 'grid-2' },
        el('div', { class: 'field' }, el('label', {}, 'Estado'), statusSel),
        el('div', { class: 'field' }, el('label', {}, 'Notas internas'), notes)),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
          if (!confirm(`¿Eliminar el registro ${r.code}? Conserva los registros mientras puedan requerirse como evidencia.`)) return;
          await call(`/api/admin/arco/${r.id}`, { method: 'DELETE' });
          loadPrivacy();
        } }, 'Eliminar'),
        el('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
          await call(`/api/admin/arco/${r.id}`, { method: 'PATCH', json: { status: statusSel.value, admin_notes: notes.value } });
          toast('Solicitud actualizada');
          loadPrivacy();
          refreshCounts();
        } }, 'Guardar')));
  }));
}
loaders.privacy = loadPrivacy;

function goToField(name) {
  $('.admin-tabs [data-tab="business"]').click();
  setTimeout(() => { const f = $(`#settings-form [name="${name}"]`); f?.scrollIntoView({ block: 'center' }); f?.focus(); }, 300);
}

async function refreshCounts() {
  const stats = await call('/api/admin/stats');
  const n = stats.orders['nuevo'] || 0;
  $('#new-count').hidden = !n;
  $('#new-count').textContent = n;
  $('#arco-count').hidden = !stats.arcoOpen;
  $('#arco-count').textContent = stats.arcoOpen;
}

// --- QR --------------------------------------------------------------------
async function loadQr() {
  const { siteUrl } = await call('/api/admin/site-url');
  const card = $('#qr-card');
  if (!siteUrl) {
    card.replaceChildren(el('div', {},
      el('h2', {}, 'Falta la dirección pública del sitio'),
      el('p', {}, 'Cuando el sitio esté publicado, define la variable SITE_URL en el servidor (por ejemplo https://tudominio.com) y reinicia. Aquí aparecerá el código QR listo para descargar.')));
    return;
  }
  card.replaceChildren(
    el('img', { src: `/api/admin-qr.png?size=600&t=${Date.now()}`, alt: `Código QR que abre ${siteUrl}` }),
    el('div', {},
      el('h2', {}, 'Escanéalo para abrir el sitio'),
      el('p', {}, el('a', { href: siteUrl, target: '_blank', rel: 'noopener' }, siteUrl)),
      el('p', { class: 'muted' }, 'Antes de imprimir, escanéalo con tu celular para comprobar que abre la página correcta.'),
      el('div', { class: 'quick-contact' },
        el('a', { class: 'btn btn-primary', href: '/api/admin-qr.png?size=1024&download=1' }, 'Descargar PNG (1024 px)'),
        el('a', { class: 'btn btn-ghost', href: '/api/admin-qr.png?size=3000&download=1' }, 'Versión para imprimir (3000 px)'))));
}
loaders.qr = loadQr;

// --- Inicio ----------------------------------------------------------------
async function startApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  try {
    categories = (await call('/api/site')).categories;
    $('#w-cat').replaceChildren(...catOptions());
  } catch { /* se reintenta al abrir galería */ }
  loadOrders().catch((e) => toast(e.message));
  // Aviso si falta información legal obligatoria
  call('/api/admin/compliance').then((groups) => {
    const missing = groups.flatMap((g) => g.items).filter((i) => !i.ok).length;
    if (missing) toast(`Hay ${missing} requisito(s) legal(es) pendiente(s). Revisa «Privacidad y legal».`);
  }).catch(() => {});
}

(async () => {
  try {
    const me = await (await fetch('/api/admin/me', { credentials: 'same-origin' })).json();
    if (me.authenticated) startApp();
    else showLogin(me.configured ? '' : 'El panel aún no está configurado: define ADMIN_PASSWORD_HASH en el servidor (ver README).');
  } catch {
    showLogin('No se pudo conectar con el servidor.');
  }
})();
