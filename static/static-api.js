// Versión estática (GitHub Pages): responde las llamadas que el sitio hace a /api/* con los datos
// incluidos en site-data.js. Los pedidos no pasan por aquí: se envían por WhatsApp (ver order-form.js).
(function () {
  const DATA = window.__KEFLITA__;
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s]/g, ' ');

  function contactReply() {
    const s = DATA.site;
    const lines = [];
    if (s.whatsapp) lines.push(`- WhatsApp: +${s.whatsapp}`);
    if (s.phone) lines.push(`- Teléfono: ${s.phone}`);
    if (s.email) lines.push(`- Correo: ${s.email}`);
    if (s.location) lines.push(`- Ubicación / zona: ${s.location}`);
    if (s.hours) lines.push(`- Horario de atención: ${s.hours}`);
    return lines.length
      ? `Puedes comunicarte directamente con nosotros:\n${lines.join('\n')}`
      : 'Por ahora el contacto se hace mediante el formulario de pedido de esta página.';
  }

  // Asistente sin IA: busca la pregunta frecuente que mejor coincide (misma lógica que el servidor).
  function reply(message) {
    const t = norm(message);
    const words = new Set(t.split(/\s+/).filter((w) => w.length > 2));
    if (/^(hola|buen[oa]s|hey|saludos|que tal)\b/.test(t.trim()) && words.size <= 4) {
      return `¡Hola! Soy el asistente de ${DATA.site.businessName}. Puedo contarte qué hacemos, cómo funcionan las cotizaciones y ayudarte a preparar tu pedido personalizado. ¿Qué te gustaría saber?`;
    }
    if (/(gracias|muy amable|perfecto)/.test(t) && words.size <= 5) {
      return '¡Con gusto! Si tienes otra duda aquí estoy. Cuando quieras, puedes enviar tu solicitud desde el formulario de pedido.';
    }
    if (/(contact|whats|telefono|llamar|ubicacion|direccion|donde estan|horario|facebook|instagram)/.test(t)) return contactReply();
    let best = null;
    let bestScore = 0;
    for (const f of DATA.faqs) {
      const keys = norm(f.keywords || '').split(/\s*,\s*|\s{2,}/).map((k) => k.trim()).filter(Boolean);
      let score = 0;
      for (const k of keys) {
        if (k.includes(' ') ? t.includes(k) : words.has(k)) score += 2;
        else if (k.length > 4 && [...words].some((w) => w.startsWith(k))) score += 2;
        else if (k.length > 4 && t.includes(k.slice(0, -1))) score += 1;
      }
      for (const w of norm(f.question).split(/\s+/)) if (w.length > 4 && words.has(w)) score += 1;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    if (best && bestScore >= 2) return best.answer;
    return 'No tengo esa información por ahora. Te sugiero escribirnos directamente o dejar tu solicitud en el formulario de pedido para que te respondan personalmente.';
  }

  function actions(text) {
    const t = norm(text);
    const a = [];
    if (/(pedido|pedir|encarg|orden|cotiz|precio|cuesta|costo|formulario|quiero)/.test(t)) a.push({ type: 'link', label: 'Ir al formulario de pedido', href: '#pedido' });
    if (/(galeria|fotos|trabajos|ejemplo|modelos|catalogo)/.test(t)) a.push({ type: 'link', label: 'Ver galería', href: '#trabajos' });
    if (/(contact|whats|telefono|llamar|hablar|duen|propietari|persona|ubicacion|direccion|donde)/.test(t)) a.push({ type: 'contact', label: 'Contactar directamente' });
    return a;
  }

  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('/api/')) return realFetch(url, opts);
    if (u === '/api/site') return json({ ...DATA.site, categories: DATA.categories, aiEnabled: false, staticMode: true });
    if (u === '/api/gallery') return json(DATA.gallery);
    if (u === '/api/faqs') return json(DATA.faqs.map(({ id, question, answer }) => ({ id, question, answer })));
    if (u === '/api/chat') {
      const { message = '' } = JSON.parse(opts.body || '{}');
      await new Promise((r) => setTimeout(r, 400));
      return json({ reply: reply(message), source: 'faq', actions: actions(message) });
    }
    return json({ error: 'Esta función no está disponible en esta versión del sitio.' }, 404);
  };
})();
