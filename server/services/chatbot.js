// Asistente virtual. Usa la API de Claude desde el servidor (la clave nunca llega al navegador)
// y, si no está configurada o falla, responde con las preguntas frecuentes guardadas.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { getSettings, listFaqs, listGallery, CATEGORIES } from '../db.js';
import { clean } from '../lib/validate.js';

const client = config.ai.apiKey ? new Anthropic({ apiKey: config.ai.apiKey, timeout: 25_000, maxRetries: 1 }) : null;

// Modelos que aceptan el respaldo automático del servidor ante un rechazo.
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5-5'];

export const aiEnabled = () => !!client;

const normalize = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ');

function contactLines(s) {
  const lines = [];
  if (s.whatsapp) lines.push(`WhatsApp: +${s.whatsapp}`);
  if (s.phone) lines.push(`Teléfono: ${s.phone}`);
  if (s.email) lines.push(`Correo: ${s.email}`);
  if (s.location) lines.push(`Ubicación / zona: ${s.location}`);
  if (s.hours) lines.push(`Horario de atención: ${s.hours}`);
  if (s.facebook) lines.push(`Facebook: ${s.facebook}`);
  if (s.instagram) lines.push(`Instagram: ${s.instagram}`);
  if (s.tiktok) lines.push(`TikTok: ${s.tiktok}`);
  return lines;
}

/** Construye el contexto del negocio a partir de los datos reales guardados en el panel. */
function buildSystemPrompt() {
  const s = getSettings();
  const faqs = listFaqs();
  const gallery = listGallery();
  const contact = contactLines(s);
  const optional = [
    s.deliveryInfo && `Entregas: ${s.deliveryInfo}`,
    s.paymentInfo && `Formas de pago: ${s.paymentInfo}`,
    s.leadTimeInfo && `Tiempos de elaboración: ${s.leadTimeInfo}`,
    s.shippingInfo && `Costos de envío: ${s.shippingInfo}`,
    s.depositInfo && `Anticipos y cancelaciones: ${s.depositInfo}`,
    s.returnsDays && `Garantía: los problemas se reportan dentro de los ${s.returnsDays} días naturales siguientes a la entrega.`,
  ].filter(Boolean);

  return `Eres el asistente virtual de "${s.businessName} – ${s.businessSubtitle}", un pequeño emprendimiento que elabora a mano piñatas personalizadas y manualidades. Atiendes a clientes en el sitio web.

# Información del negocio (única fuente de verdad)
${s.aboutText}
${s.aboutExtra}

Categorías de trabajos: ${CATEGORIES.map((c) => c.name).join(', ')}.
Algunos trabajos que aparecen en la galería: ${gallery.map((g) => g.title).join('; ')}.

Contacto disponible:
${contact.length ? contact.join('\n') : '(Aún no hay datos de contacto publicados. Indica que pueden enviar su solicitud desde el formulario de pedidos.)'}
${optional.length ? '\n' + optional.join('\n') : ''}

# Preguntas frecuentes
${faqs.map((f) => `P: ${f.question}\nR: ${f.answer}`).join('\n\n')}

# Cómo funciona un pedido
1. El cliente llena el formulario de "Pedido personalizado" en esta página (sección #pedido): nombre, teléfono, tipo de producto, tamaño, personaje o temática, colores, cantidad, fecha, descripción, presupuesto opcional, fotos de referencia y un boceto opcional dibujado en la página.
2. Revisa un resumen y envía la solicitud.
3. El negocio revisa los detalles, confirma disponibilidad y envía la cotización. Enviar la solicitud NO confirma el pedido.

# Documentos legales del sitio
- Aviso de privacidad: /aviso-de-privacidad (qué datos se recaban y para qué; no se usan para publicidad).
- Términos y condiciones: /terminos-y-condiciones
- Devoluciones y garantías: /devoluciones-y-garantias (reparación, reposición o devolución si el producto tiene defectos o no corresponde a lo acordado).
- Derechos ARCO (acceso, rectificación, cancelación, oposición): formulario en /derechos-arco
- El sitio no cobra ni pide datos bancarios; los pagos se acuerdan directamente con el negocio.

# Reglas obligatorias
- Responde siempre en español, de forma cálida, breve (máximo 4–5 oraciones o una lista corta) y profesional.
- Usa solo la información anterior. Si algo no está aquí (dirección, horarios, envíos, formas de pago, materiales específicos, tiempos), di con honestidad que no tienes ese dato y sugiere contactar directamente al negocio o dejar la solicitud en el formulario.
- NUNCA des precios, rangos de precios ni estimaciones de costo. Explica que cada trabajo se cotiza según tamaño, diseño, complejidad, materiales y personalización.
- NUNCA confirmes pedidos, apartados ni disponibilidad, y no prometas fechas de entrega.
- No inventes productos, servicios, promociones, datos de contacto ni políticas.
- Puedes ayudar al cliente a describir su idea: pregúntale por la ocasión, personaje o temática, tamaño, colores, nombre o número que debe llevar, cantidad y fecha, y recomiéndale adjuntar fotos de referencia o hacer un boceto.
- Cuando el cliente esté listo, invítalo a llenar el formulario de pedido de esta página.
- No uses Markdown complejo (sin tablas ni encabezados); puedes usar guiones para listas.
- Eres un asistente automático (inteligencia artificial); si te preguntan, dilo con claridad.
- Pide al cliente que no escriba datos personales sensibles en el chat; para su pedido debe usar el formulario.
- Si te piden algo ajeno al negocio, redirige amablemente la conversación a piñatas y manualidades.`;
}

/** Botones sugeridos según lo que pregunta el cliente (mismos en modo IA y modo respaldo). */
function suggestActions(text) {
  const t = normalize(text);
  const actions = [];
  if (/(pedido|pedir|encarg|orden|cotiz|precio|cuesta|costo|formulario|quiero)/.test(t)) {
    actions.push({ type: 'link', label: 'Ir al formulario de pedido', href: '#pedido' });
  }
  if (/(galeria|fotos|trabajos|ejemplo|modelos|catalogo)/.test(t)) {
    actions.push({ type: 'link', label: 'Ver galería', href: '#galeria' });
  }
  if (/(contact|whats|telefono|llamar|hablar|duen|propietari|persona|ubicacion|direccion|donde)/.test(t)) {
    actions.push({ type: 'contact', label: 'Contactar directamente' });
  }
  return actions;
}

/** Respuesta de respaldo: busca la pregunta frecuente que mejor coincide. */
export function fallbackReply(message) {
  const s = getSettings();
  const t = normalize(message);
  const words = new Set(t.split(/\s+/).filter((w) => w.length > 2));

  if (/^(hola|buen[oa]s|hey|saludos|que tal)\b/.test(t.trim()) && words.size <= 4) {
    return `¡Hola! Soy el asistente de ${s.businessName}. Puedo contarte qué hacemos, cómo funcionan las cotizaciones y ayudarte a preparar tu pedido personalizado. ¿Qué te gustaría saber?`;
  }
  if (/(gracias|muy amable|perfecto)/.test(t) && words.size <= 5) {
    return '¡Con gusto! Si tienes otra duda aquí estoy. Cuando quieras, puedes enviar tu solicitud desde el formulario de pedido.';
  }
  if (/(contact|whats|telefono|llamar|ubicacion|direccion|donde estan|horario|facebook|instagram)/.test(t)) {
    const lines = contactLines(s);
    return lines.length
      ? `Puedes comunicarte directamente con nosotros:\n${lines.map((l) => `- ${l}`).join('\n')}`
      : 'Por ahora el contacto se hace mediante el formulario de pedido de esta página: deja tus datos y te responderemos lo antes posible.';
  }

  let best = null;
  let bestScore = 0;
  for (const f of listFaqs()) {
    const keys = normalize(f.keywords).split(/\s*,\s*|\s{2,}/).map((k) => k.trim()).filter(Boolean);
    let score = 0;
    for (const k of keys) {
      if (k.includes(' ') ? t.includes(k) : words.has(k)) score += 2;
      else if (k.length > 4 && t.includes(k.slice(0, -1))) score += 1;
    }
    for (const w of normalize(f.question).split(/\s+/)) if (w.length > 4 && words.has(w)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  if (best && bestScore >= 2) return best.answer;

  return 'No tengo esa información por ahora. Te sugiero dejar tu consulta en el formulario de pedido o contactar directamente al negocio para que te respondan personalmente.';
}

/** Limpia el historial enviado por el navegador: roles válidos, alternados y longitudes limitadas. */
function sanitizeHistory(history) {
  const out = [];
  for (const m of Array.isArray(history) ? history.slice(-12) : []) {
    const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
    const content = clean(m?.content, 1500);
    if (!role || !content) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += `\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export async function answer(message, history) {
  const text = clean(message, 1000);
  const actions = suggestActions(text);
  if (!client) return { reply: fallbackReply(text), source: 'faq', actions };

  const messages = sanitizeHistory([...(history || []), { role: 'user', content: text }]);
  try {
    const useFallbacks = FALLBACK_MODELS.includes(config.ai.model);
    const response = await client.beta.messages.create({
      model: config.ai.model,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      output_config: { effort: config.ai.effort },
      ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      messages,
    });
    if (response.stop_reason === 'refusal') {
      return { reply: fallbackReply(text), source: 'faq', actions };
    }
    const reply = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { reply: reply || fallbackReply(text), source: reply ? 'ai' : 'faq', actions };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) console.error('[chat] Clave de API inválida');
    else if (error instanceof Anthropic.RateLimitError) console.warn('[chat] Límite de uso alcanzado');
    else if (error instanceof Anthropic.APIError) console.error(`[chat] Error de API ${error.status}: ${error.message}`);
    else console.error('[chat] Error de conexión:', error.message);
    return { reply: fallbackReply(text), source: 'faq', actions };
  }
}
