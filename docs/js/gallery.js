// Galería de trabajos con filtros por categoría y visor ampliable.
import { $, el, api, trapFocus } from './utils.js';

let items = [];
let categories = [];
let current = null;
let index = 0;
let releaseFocus = null;

const catName = (id) => categories.find((c) => c.id === id)?.name || id;

function renderFilters(active) {
  const counts = items.reduce((m, it) => ((m[it.category] = (m[it.category] || 0) + 1), m), {});
  const box = $('#gallery-filters');
  const btn = (id, label, n) =>
    el('button', { type: 'button', class: 'filter-btn', 'aria-pressed': String(active === id), 'data-cat': id },
      label, el('span', { class: 'count' }, `(${n})`));
  box.replaceChildren(
    btn('todos', 'Todos', items.length),
    ...categories.filter((c) => counts[c.id]).map((c) => btn(c.id, c.name, counts[c.id]))
  );
}

function renderGrid(filter) {
  const grid = $('#gallery-grid');
  const list = filter === 'todos' ? items : items.filter((it) => it.category === filter);
  grid.replaceChildren(
    ...list.map((it, i) =>
      el('button', {
        type: 'button', class: 'work-card', style: `animation-delay:${Math.min(i, 12) * 40}ms`,
        'aria-label': `${it.title}. Ver ${it.photos.length} ${it.photos.length === 1 ? 'foto' : 'fotos'}`,
        onclick: () => openLightbox(it, 0),
      },
      el('div', { class: 'work-media' },
        el('img', { src: it.photos[0].url, alt: '', loading: 'lazy', decoding: 'async', width: 370, height: 370 }),
        it.photos.length > 1 ? el('span', { class: 'work-badge' }, `📷 ${it.photos.length}`) : null),
      el('div', { class: 'work-body' },
        el('p', { class: 'work-cat' }, catName(it.category)),
        el('h3', { class: 'work-title' }, it.title)))
    )
  );
  if (!list.length) grid.append(el('p', { class: 'muted' }, 'Aún no hay trabajos en esta categoría.'));
}

function showPhoto(i) {
  index = (i + current.photos.length) % current.photos.length;
  const img = $('#lb-img');
  img.src = current.photos[index].url;
  img.alt = `${current.title} — foto ${index + 1} de ${current.photos.length}`;
  for (const [n, b] of [...$('#lb-thumbs').children].entries()) b.setAttribute('aria-current', String(n === index));
}

function openLightbox(item, i) {
  current = item;
  $('#lb-title').textContent = item.title;
  $('#lb-cat').textContent = catName(item.category);
  $('#lb-desc').textContent = item.description || '';
  const multi = item.photos.length > 1;
  $('#lb-prev').hidden = !multi;
  $('#lb-next').hidden = !multi;
  $('#lb-thumbs').replaceChildren(
    ...(multi ? item.photos.map((p, n) =>
      el('button', { type: 'button', 'aria-label': `Ver foto ${n + 1}`, onclick: () => showPhoto(n) }, el('img', { src: p.url, alt: '' }))) : [])
  );
  showPhoto(i);
  const lb = $('#lightbox');
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
  releaseFocus = trapFocus(lb, closeLightbox);
  $('#lb-close').focus();
}

function closeLightbox() {
  $('#lightbox').hidden = true;
  document.body.style.overflow = '';
  releaseFocus?.();
  releaseFocus = null;
}

export async function initGallery(site) {
  categories = site.categories || [];
  const grid = $('#gallery-grid');
  try {
    items = await api('/api/gallery');
  } catch {
    grid.replaceChildren(el('p', { class: 'muted' }, 'No se pudo cargar la galería. Recarga la página para intentarlo de nuevo.'));
    return;
  }
  let active = 'todos';
  renderFilters(active);
  renderGrid(active);

  $('#gallery-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    active = b.dataset.cat;
    renderFilters(active);
    renderGrid(active);
    $(`[data-cat="${active}"]`)?.focus();
  });

  const lb = $('#lightbox');
  $('#lb-close').addEventListener('click', closeLightbox);
  $('#lb-prev').addEventListener('click', () => showPhoto(index - 1));
  $('#lb-next').addEventListener('click', () => showPhoto(index + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden || current?.photos.length < 2) return;
    if (e.key === 'ArrowLeft') showPhoto(index - 1);
    if (e.key === 'ArrowRight') showPhoto(index + 1);
  });
  // Deslizar con el dedo en celulares
  let x0 = null;
  const stage = $('.lb-stage');
  stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) showPhoto(index + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  $('#lb-want').addEventListener('click', () => {
    const it = current;
    closeLightbox();
    document.dispatchEvent(new CustomEvent('prefill-order', { detail: { theme: `Algo como: ${it.title}`, category: it.category } }));
    $('#pedido').scrollIntoView({ behavior: 'smooth' });
  });
}
