// Asistente virtual: interfaz del chat. Las respuestas se generan en el servidor.
import { $, $$, el, api, whatsappLink } from './utils.js';

const STORAGE_KEY = 'keflita-chat';

export function initChat(site) {
  const fab = $('#fab-chat');
  const panel = $('#chat-panel');
  const log = $('#chat-log');
  const form = $('#chat-form');
  const input = $('#chat-input');
  let history = [];
  let busy = false;

  try { history = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]').slice(-20); } catch { history = []; }
  const save = () => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-20))); } catch { /* sin almacenamiento */ } };

  $('#chat-status').textContent = site.aiEnabled ? 'Asesor virtual · en línea' : 'Asesor virtual · respuestas rápidas';

  const scroll = () => { log.scrollTop = log.scrollHeight; };

  function contactAction() {
    const wa = whatsappLink(site.whatsapp, `¡Hola, ${site.businessName}! Vengo del asistente de su página y quisiera hablar con ustedes.`);
    if (wa) return el('a', { href: wa, target: '_blank', rel: 'noopener' }, '💬 Abrir WhatsApp');
    return el('a', { href: '#contacto', onclick: close }, '📇 Ver contacto');
  }

  function addMessage(role, text, actions = []) {
    log.append(el('div', { class: `msg ${role === 'user' ? 'user' : 'bot'}` }, text));
    if (actions.length) {
      log.append(el('div', { class: 'msg-actions' }, actions.map((a) =>
        a.type === 'contact' ? contactAction() : el('a', { href: a.href, onclick: close }, a.label))));
    }
    scroll();
  }

  function greet() {
    addMessage('assistant',
      `¡Hola! 👋 Soy el asistente virtual de ${site.businessName}. Te puedo contar qué hacemos, cómo funcionan las cotizaciones y ayudarte a describir la piñata o el accesorio que imaginas. ¿En qué te ayudo?`);
  }

  function open() {
    panel.hidden = false;
    fab.hidden = true;
    fab.classList.add('seen');
    fab.setAttribute('aria-expanded', 'true');
    if (!log.children.length) {
      greet();
      for (const m of history) addMessage(m.role, m.content);
    }
    setTimeout(() => input.focus(), 50);
  }
  function close() {
    panel.hidden = true;
    fab.hidden = false;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    addMessage('user', text);
    input.value = '';
    const typing = el('div', { class: 'msg bot', 'aria-label': 'Escribiendo' }, el('span', { class: 'typing' }, el('i'), el('i'), el('i')));
    log.append(typing);
    scroll();
    try {
      const res = await api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      typing.remove();
      addMessage('assistant', res.reply, res.actions);
      history.push({ role: 'user', content: text }, { role: 'assistant', content: res.reply });
      save();
    } catch (err) {
      typing.remove();
      addMessage('assistant', err.status === 429 ? err.message : 'Uy, no pude responder en este momento. Puedes intentarlo de nuevo o dejar tu solicitud en el formulario de pedido.',
        [{ type: 'link', label: 'Ir al formulario', href: '#pedido' }]);
    } finally {
      busy = false;
      input.focus();
    }
  }

  fab.addEventListener('click', open);
  $('#chat-close').addEventListener('click', close);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  $('#chat-quick').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); });
  $$('[data-open-chat]').forEach((b) => b.addEventListener('click', open));
}
