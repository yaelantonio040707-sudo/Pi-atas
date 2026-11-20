// Versión estática: la solicitud ARCO se envía por WhatsApp o por correo (no hay servidor que la guarde).
(function () {
  const s = (window.__KEFLITA__ || {}).site || {};
  const form = document.querySelector('.arco-form');
  if (!form) return;
  form.removeAttribute('action');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const code = `ARCO-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const text = [
      `Solicitud de derechos ARCO (${code})`,
      `Nombre: ${v.name}`,
      `Contacto para responder: ${v.contact}`,
      `Derecho: ${v.right_type}`,
      v.order_code ? `Folio de pedido: ${v.order_code}` : '',
      `Descripción: ${v.description}`,
      'Declaro que soy el titular de los datos o su representante legal.',
    ].filter(Boolean).join('\n');
    const email = s.privacyEmail || s.email;
    let link = null;
    let via = '';
    if (s.whatsapp) { link = `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(text)}`; via = 'WhatsApp'; }
    else if (email) { link = `mailto:${email}?subject=${encodeURIComponent('Solicitud ARCO ' + code)}&body=${encodeURIComponent(text)}`; via = 'tu correo'; }

    const box = document.createElement('div');
    box.className = 'legal-success';
    box.setAttribute('role', 'status');
    if (!link) {
      box.innerHTML = '<p>Los datos de contacto del negocio aún no están configurados en el sitio. Intenta más tarde.</p>';
    } else {
      window.open(link, '_blank', 'noopener');
      box.innerHTML = `<p><strong>Folio ${code}.</strong> Se abrió ${via} con tu solicitud ya escrita: solo envíala.</p>
        <p>Antes de entregar o modificar información te pediremos acreditar tu identidad. Te responderemos en un plazo máximo de 20 días.</p>
        <p><a class="btn btn-primary" href="${link}" target="_blank" rel="noopener">Abrir ${via} de nuevo</a></p>`;
    }
    form.replaceWith(box);
    box.scrollIntoView({ block: 'center' });
  });
})();
