// Formulario de pedidos personalizados: validación, fotos de referencia, boceto, resumen y envío.
import { $, $$, el, api, toast, trapFocus, whatsappLink, formatDate } from './utils.js';
import { initSketch } from './sketch.js';
import { initDatePicker } from './datepicker.js';

const MAX_FILES = 4;
const MAX_MB = 8;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const CATEGORY_TO_TYPE = { sombreros: 'Sombrero', accesorios: 'Accesorio', decoraciones: 'Decoración' };

const LABELS = {
  name: 'Nombre', phone: 'Contacto', product: 'Producto', theme: 'Personaje / temática', size: 'Tamaño',
  colors: 'Colores', quantity: 'Cantidad', needed_date: 'Fecha', budget: 'Presupuesto', description: 'Detalles',
};

function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function initOrderForm(site) {
  const form = $('#order-form');
  const sketch = initSketch();
  let files = [];
  let releaseFocus = null;

  form.started_at.value = Date.now();
  // Al elegir fecha se revalida para quitar el mensaje de error si lo había
  const datePicker = initDatePicker({ onChange: () => { if ($('[data-error-for="needed_date"]').textContent) validate(); } });

  // --- Tipo de producto "Otro" ---
  const otherField = $('#other-field');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'product_type') {
      otherField.hidden = form.product_type.value !== 'Otro';
      if (!otherField.hidden) form.product_other.focus();
    }
  });

  // --- Contador de descripción ---
  const count = $('#desc-count');
  form.description.addEventListener('input', () => { count.textContent = form.description.value.length; });

  // --- Pestañas fotos / boceto ---
  const tabs = $$('[role="tab"]', form);
  const selectTab = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    }
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      selectTab(next);
    });
  });

  // --- Fotos de referencia ---
  const input = $('#f-refs');
  const thumbs = $('#ref-thumbs');
  const refsError = $('#refs-error');
  const renderThumbs = () => {
    for (const img of $$('img', thumbs)) URL.revokeObjectURL(img.src);
    thumbs.replaceChildren(...files.map((f, i) =>
      el('li', {},
        el('img', { src: URL.createObjectURL(f), alt: `Referencia ${i + 1}: ${f.name}` }),
        el('button', { type: 'button', 'aria-label': `Quitar ${f.name}`, onclick: () => { files.splice(i, 1); renderThumbs(); } }, '✕'))));
  };
  const addFiles = (list) => {
    refsError.textContent = '';
    for (const f of list) {
      if (files.length >= MAX_FILES) { refsError.textContent = `Máximo ${MAX_FILES} fotos de referencia.`; break; }
      if (!TYPES.includes(f.type)) { refsError.textContent = `"${f.name}" no es una imagen compatible (JPG, PNG, WEBP o GIF).`; continue; }
      if (f.size > MAX_MB * 1024 * 1024) { refsError.textContent = `"${f.name}" pesa más de ${MAX_MB} MB.`; continue; }
      files.push(f);
    }
    renderThumbs();
  };
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  // --- Prellenado desde la galería ---
  document.addEventListener('prefill-order', (e) => {
    const { theme, category } = e.detail;
    form.theme.value = theme;
    const type = CATEGORY_TO_TYPE[category] || 'Piñata';
    const radio = $(`input[name="product_type"][value="${type}"]`, form);
    if (radio) { radio.checked = true; otherField.hidden = true; }
    toast('Agregamos ese trabajo como referencia. Completa tus datos.');
  });

  // --- Validación ---
  const setError = (name, msg) => {
    const p = $(`[data-error-for="${name}"]`, form);
    if (p) p.textContent = msg || '';
    const field = form.elements[name];
    const target = field instanceof RadioNodeList ? null : field;
    if (target) {
      target.setAttribute('aria-invalid', msg ? 'true' : 'false');
      target.closest('.field')?.classList.toggle('invalid', !!msg);
    }
  };
  function validate() {
    const v = Object.fromEntries(new FormData(form));
    const errors = {};
    if ((v.name || '').trim().length < 2) errors.name = 'Escribe tu nombre.';
    const digits = (v.phone || '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15 || !/^[\d\s()+.-]+$/.test(v.phone.trim())) errors.phone = 'Escribe un número válido (8 a 15 dígitos).';
    if (!v.product_type) errors.product_type = 'Elige el tipo de producto.';
    if (v.product_type === 'Otro' && (v.product_other || '').trim().length < 2) errors.product_other = 'Cuéntanos qué producto necesitas.';
    if ((v.theme || '').trim().length < 2) errors.theme = 'Indica el personaje, animal, temática o diseño.';
    const q = Number(v.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 500) errors.quantity = 'Indica una cantidad entre 1 y 500.';
    if (!v.needed_date) errors.needed_date = 'Indica la fecha para la que lo necesitas.';
    else if (v.needed_date < localToday()) errors.needed_date = 'La fecha no puede ser anterior a hoy.';
    if (v.accept_privacy !== '1') errors.accept_privacy = 'Para enviar tu solicitud debes aceptar el aviso de privacidad y los términos.';
    ['name', 'phone', 'product_type', 'product_other', 'theme', 'quantity', 'needed_date', 'accept_privacy'].forEach((k) => setError(k, errors[k]));
    return { values: v, errors };
  }
  form.addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid') === 'true') validate(); });

  // --- Resumen ---
  const modal = $('#summary-modal');
  const productText = (v) => (v.product_type === 'Otro' ? `Otro: ${v.product_other}` : v.product_type);
  function summaryRows(v) {
    return [
      [LABELS.name, v.name], [LABELS.phone, v.phone], [LABELS.product, productText(v)], [LABELS.theme, v.theme],
      [LABELS.size, v.size], [LABELS.colors, v.colors], [LABELS.quantity, v.quantity],
      [LABELS.needed_date, formatDate(v.needed_date)], [LABELS.budget, v.budget], [LABELS.description, v.description],
    ].filter(([, val]) => String(val ?? '').trim());
  }
  const consentRows = (v) => [
    ['Aviso de privacidad', v.accept_privacy === '1' ? 'Aceptado' : 'No aceptado'],
    ['Publicar fotos del trabajo', v.allow_publish === '1' ? 'Sí, autorizo' : 'No'],
  ];
  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    releaseFocus = trapFocus(modal, closeModal);
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    releaseFocus?.();
    releaseFocus = null;
  }

  let lastValues = null;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    $('#form-error').textContent = '';
    const { values, errors } = validate();
    if (Object.keys(errors).length) {
      $('#form-error').textContent = 'Revisa los campos marcados en rojo.';
      const first = Object.keys(errors)[0];
      const f = form.elements[first];
      if (first === 'needed_date') datePicker.focus();
      else (f instanceof RadioNodeList ? f[0] : f)?.focus();
      return;
    }
    lastValues = values;
    $('#summary-view').hidden = false;
    $('#success-view').hidden = true;
    $('#submit-error').textContent = '';
    $('#summary-list').replaceChildren(...[...summaryRows(values), ...consentRows(values)].flatMap(([k, val]) => [el('dt', {}, k), el('dd', {}, String(val))]));
    const imgs = files.map((f) => el('img', { src: URL.createObjectURL(f), alt: 'Foto de referencia' }));
    if (sketch.hasSketch()) imgs.push(el('img', { src: sketch.dataUrl(), alt: 'Tu boceto' }));
    $('#summary-images').replaceChildren(...(imgs.length ? [el('p', { class: 'muted' }, `Imágenes adjuntas: ${imgs.length}`), ...imgs] : []));
    openModal();
    $('#summary-send').focus();
  });

  $('#summary-edit').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal && !$('#summary-view').hidden) closeModal(); });

  $('#summary-send').addEventListener('click', async () => {
    const btn = $('#summary-send');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    $('#submit-error').textContent = '';
    try {
      const fd = new FormData(form);
      files.forEach((f) => fd.append('references', f, f.name));
      const blob = await sketch.getBlob();
      if (blob) fd.append('sketch', blob, 'boceto.png');
      const { code } = await api('/api/orders', { method: 'POST', body: fd });
      showSuccess(code, lastValues);
    } catch (err) {
      if (err.fields) {
        Object.entries(err.fields).forEach(([k, m]) => setError(k, m));
        closeModal();
        $('#form-error').textContent = err.message;
      } else {
        $('#submit-error').textContent = err.message;
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar solicitud';
    }
  });

  function showSuccess(code, v) {
    $('#summary-view').hidden = true;
    $('#success-view').hidden = false;
    $('#success-code').textContent = code;
    const text = [
      `¡Hola, ${site.businessName}! Acabo de enviar una solicitud de pedido desde su página.`,
      `Folio: ${code}`,
      ...summaryRows(v).map(([k, val]) => `• ${k}: ${val}`),
      files.length || sketch.hasSketch() ? '(Adjunté imágenes de referencia en el formulario.)' : '',
    ].filter(Boolean).join('\n');
    const wa = whatsappLink(site.whatsapp, text);
    const waBtn = $('#success-wa');
    waBtn.hidden = !wa;
    if (wa) waBtn.href = wa;
    $('#success-title').focus();

    form.reset();
    files = [];
    renderThumbs();
    sketch.clear();
    datePicker.reset();
    otherField.hidden = true;
    count.textContent = '0';
    form.started_at.value = Date.now();
  }
  $('#success-close').addEventListener('click', closeModal);
}
