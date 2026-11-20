// Punto de entrada del sitio público.
import { $, $$, el, api, whatsappLink } from './utils.js';
import { initGallery } from './gallery.js';
import { initOrderForm } from './order-form.js';
import { initChat } from './chat.js';

export const site = { whatsapp: '', businessName: 'Keflita', categories: [] };

function initHeader() {
  const header = $('.site-header');
  const toggle = $('.nav-toggle');
  const nav = $('#main-nav');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const close = () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Abrir menú'); };
  toggle.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function initReveal() {
  const items = $$('.reveal');
  if (!('IntersectionObserver' in window)) { items.forEach((n) => n.classList.add('visible')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  items.forEach((n) => io.observe(n));
}

function applySite(data) {
  Object.assign(site, data);
  for (const node of $$('[data-bind]')) {
    const v = data[node.dataset.bind];
    if (v) node.textContent = v;
  }
  if (data.businessName) document.title = `${data.businessName} · ${data.businessSubtitle || 'Piñatas personalizadas'}`;

  // WhatsApp flotante y en contacto (solo si hay número configurado)
  const greeting = `¡Hola, ${data.businessName}! Vi su página y me gustaría información sobre sus piñatas y trabajos personalizados.`;
  const wa = whatsappLink(data.whatsapp, greeting);
  for (const id of ['#fab-wa', '#contact-wa']) {
    const a = $(id);
    if (wa) { a.href = wa; a.hidden = false; } else a.hidden = true;
  }

  // Datos de contacto: solo se muestran los que el negocio haya registrado
  const list = $('#contact-list');
  list.replaceChildren();
  const add = (icon, label, content) => list.append(el('li', {}, el('span', { 'aria-hidden': 'true' }, icon), el('span', {}, el('span', { class: 'sr-only' }, `${label}: `), content)));
  if (data.whatsapp) add('💬', 'WhatsApp', el('a', { href: wa, target: '_blank', rel: 'noopener' }, `+${data.whatsapp}`));
  if (data.phone) add('📞', 'Teléfono', el('a', { href: `tel:${data.phone.replace(/[^\d+]/g, '')}` }, data.phone));
  if (data.email) add('✉️', 'Correo', el('a', { href: `mailto:${data.email}` }, data.email));
  if (data.location) add('📍', 'Ubicación', data.location);
  if (data.hours) add('🕑', 'Horario', data.hours);
  if (!list.children.length) {
    list.append(el('li', {}, el('span', { 'aria-hidden': 'true' }, '📝'),
      el('span', {}, 'Déjanos tu solicitud en el formulario de pedido y te contactaremos al número que nos compartas.')));
  }

  // Información de compra (PROFECO): se muestra lo que el negocio haya capturado en el panel
  for (const node of $$('[data-info]')) {
    const v = data[node.dataset.info];
    if (v) node.textContent = v;
  }
  const days = Number.parseInt(data.returnsDays, 10);
  const daysNode = $('[data-info-days]');
  if (daysNode && days > 0) daysNode.textContent = ` (repórtalo dentro de los ${days} días naturales siguientes a la entrega)`;
  if (data.legalName) {
    $('#privacy-resp').textContent = `${data.legalName} («${data.businessName}»)`;
    $('#footer-legal-id').textContent = ` · Responsable: ${data.legalName}${data.legalAddress ? `, ${data.legalAddress}` : ''}`;
  }

  const social = $('#footer-social');
  social.replaceChildren();
  for (const [k, label] of [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']]) {
    if (/^https:\/\//.test(data[k] || '')) social.append(el('a', { href: data[k], target: '_blank', rel: 'noopener' }, label));
  }
}

async function loadFaqs() {
  const list = $('#faq-list');
  try {
    const faqs = await api('/api/faqs');
    list.replaceChildren(...faqs.map((f) => el('details', { class: 'faq-item' }, el('summary', {}, f.question), el('p', {}, f.answer))));
  } catch {
    list.replaceChildren(el('p', { class: 'muted' }, 'No se pudieron cargar las preguntas frecuentes.'));
  }
}

async function start() {
  document.documentElement.classList.remove('no-js');
  $('#year').textContent = new Date().getFullYear();
  initHeader();
  initReveal();
  try {
    applySite(await api('/api/site'));
  } catch {
    applySite(site);
  }
  initGallery(site);
  initOrderForm(site);
  initChat(site);
  loadFaqs();
}

start();
