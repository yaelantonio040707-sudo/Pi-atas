// Área de dibujo sencilla para que el cliente haga un boceto de su pedido.
import { $, $$, el } from './utils.js';

const COLORS = ['#2a1a3a', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ec407a', '#8d6e63', '#ffffff'];

export function initSketch() {
  const canvas = $('#sketch-canvas');
  const ctx = canvas.getContext('2d');
  const include = $('#sketch-include');
  const sizeInput = $('#sketch-size');
  const fillInput = $('#sketch-fill');
  const state = { tool: 'pen', color: COLORS[0], drawing: false, start: null, snapshot: null, dirty: false };
  const history = [];

  const reset = () => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };
  reset();

  // Paleta de colores
  const colorBox = $('#sketch-colors');
  const picker = el('input', { type: 'color', value: '#6c4cf0', 'aria-label': 'Otro color', title: 'Otro color' });
  const swatches = COLORS.map((c) =>
    el('button', { type: 'button', class: 'swatch', style: `background:${c}`, 'aria-label': `Color ${c}`, 'aria-pressed': String(c === state.color), 'data-color': c })
  );
  colorBox.append(...swatches, picker);
  const setColor = (c) => {
    state.color = c;
    swatches.forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.color === c)));
    if (state.tool === 'eraser') setTool('pen');
  };
  colorBox.addEventListener('click', (e) => { const s = e.target.closest('.swatch'); if (s) setColor(s.dataset.color); });
  picker.addEventListener('input', () => setColor(picker.value));

  const toolButtons = $$('[data-tool]');
  function setTool(t) {
    state.tool = t;
    toolButtons.forEach((b) => { b.classList.toggle('active', b.dataset.tool === t); b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
  }
  toolButtons.forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

  const pushHistory = () => {
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (history.length > 25) history.shift();
  };
  $('#sketch-undo').addEventListener('click', () => {
    const prev = history.pop();
    if (prev) ctx.putImageData(prev, 0, 0);
  });
  $('#sketch-clear').addEventListener('click', () => {
    if (state.dirty && !confirm('¿Borrar todo el boceto?')) return;
    pushHistory();
    reset();
    state.dirty = false;
    include.checked = false;
  });

  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  };
  const applyStyle = () => {
    const color = state.tool === 'eraser' ? '#ffffff' : state.color;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Number(sizeInput.value) * (state.tool === 'eraser' ? 2.5 : 1);
  };

  function drawShape(a, b) {
    ctx.beginPath();
    if (state.tool === 'line') {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      return;
    }
    if (state.tool === 'rect') ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    if (state.tool === 'circle') ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    if (fillInput.checked) ctx.fill();
    ctx.stroke();
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    canvas.setPointerCapture(e.pointerId);
    pushHistory();
    state.drawing = true;
    state.start = point(e);
    applyStyle();
    if (state.tool === 'pen' || state.tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(state.start.x, state.start.y);
      ctx.lineTo(state.start.x + 0.01, state.start.y);
      ctx.stroke();
    } else {
      state.snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.drawing) return;
    const p = point(e);
    if (state.tool === 'pen' || state.tool === 'eraser') {
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      ctx.putImageData(state.snapshot, 0, 0);
      drawShape(state.start, p);
    }
  });
  const end = () => {
    if (!state.drawing) return;
    state.drawing = false;
    state.snapshot = null;
    if (!state.dirty) include.checked = true; // al empezar a dibujar se marca para incluirlo
    state.dirty = true;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return {
    /** Devuelve el boceto como PNG si el cliente decidió incluirlo. */
    async getBlob() {
      if (!include.checked || !state.dirty) return null;
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    },
    hasSketch: () => include.checked && state.dirty,
    dataUrl: () => canvas.toDataURL('image/png'),
    clear() { reset(); history.length = 0; state.dirty = false; include.checked = false; },
  };
}
