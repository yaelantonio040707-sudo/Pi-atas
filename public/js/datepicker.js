// Calendario propio para elegir la fecha del pedido.
// No depende del selector nativo del navegador (que en algunos celulares o visores incrustados no abre).
import { $, el } from './utils.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function initDatePicker({ onChange } = {}) {
  const button = $('#f-date');
  const text = $('#f-date-text');
  const hidden = $('#f-date-value');
  const cal = $('#cal');
  const today = startOfDay(new Date());
  const maxDate = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate());
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = null;
  let focusDay = today;

  function label(d) {
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function render() {
    const y = view.getFullYear();
    const m = view.getMonth();
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // lunes primero
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const canPrev = new Date(y, m, 0) >= today;
    const canNext = new Date(y, m + 1, 1) <= maxDate;

    const grid = el('div', { class: 'cal-grid', role: 'grid', 'aria-label': `${MONTHS[m]} ${y}` },
      DAYS.map((d) => el('span', { class: 'cal-dow', 'aria-hidden': 'true' }, d)),
      Array.from({ length: offset }, () => el('span', { class: 'cal-empty' })));
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const disabled = d < today || d > maxDate;
      const isSel = selected && iso(d) === iso(selected);
      const isFocus = iso(d) === iso(focusDay);
      grid.append(el('button', {
        type: 'button', class: `cal-day${isSel ? ' selected' : ''}${iso(d) === iso(today) ? ' today' : ''}`,
        'data-date': iso(d), disabled, 'aria-label': label(d), 'aria-pressed': String(!!isSel),
        tabindex: isFocus && !disabled ? '0' : '-1',
      }, String(day)));
    }
    cal.replaceChildren(
      el('div', { class: 'cal-head' },
        el('button', { type: 'button', class: 'cal-nav', 'data-nav': '-1', disabled: !canPrev, 'aria-label': 'Mes anterior' }, '‹'),
        el('strong', { 'aria-live': 'polite' }, `${MONTHS[m]} ${y}`),
        el('button', { type: 'button', class: 'cal-nav', 'data-nav': '1', disabled: !canNext, 'aria-label': 'Mes siguiente' }, '›')),
      grid,
      el('div', { class: 'cal-foot' },
        el('button', { type: 'button', class: 'link-btn', 'data-close': '1' }, 'Cerrar')));
  }

  function open() {
    focusDay = selected || today;
    view = new Date(focusDay.getFullYear(), focusDay.getMonth(), 1);
    render();
    cal.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    cal.querySelector('.cal-day[tabindex="0"]')?.focus();
  }
  function close(returnFocus = true) {
    cal.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) button.focus();
  }
  function choose(d) {
    selected = d;
    hidden.value = iso(d);
    text.textContent = label(d);
    button.classList.add('has-value');
    close();
    onChange?.(hidden.value);
  }

  button.addEventListener('click', () => (cal.hidden ? open() : close()));
  cal.addEventListener('click', (e) => {
    // Los botones se redibujan al cambiar de mes; evita que el clic cuente como "clic afuera"
    e.stopPropagation();
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      view = new Date(view.getFullYear(), view.getMonth() + Number(nav.dataset.nav), 1);
      focusDay = view < today ? today : view;
      render();
      return;
    }
    if (e.target.closest('[data-close]')) return close();
    const day = e.target.closest('.cal-day');
    if (day && !day.disabled) {
      const [y, m, d] = day.dataset.date.split('-').map(Number);
      choose(new Date(y, m - 1, d));
    }
  });
  // Teclado: flechas para moverse, Enter para elegir, Escape para cerrar
  cal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = new Date(focusDay.getFullYear(), focusDay.getMonth(), focusDay.getDate() + step);
    if (next < today || next > maxDate) return;
    focusDay = next;
    view = new Date(next.getFullYear(), next.getMonth(), 1);
    render();
    cal.querySelector('.cal-day[tabindex="0"]')?.focus();
  });
  document.addEventListener('click', (e) => {
    if (!cal.hidden && !e.target.closest('#datepick')) close(false);
  });

  return {
    reset() {
      selected = null;
      hidden.value = '';
      text.textContent = 'Elige una fecha';
      button.classList.remove('has-value');
    },
    focus: () => button.focus(),
  };
}
