// Páginas legales generadas en el servidor a partir de los datos capturados en el panel.
// Cuando falta un dato obligatorio se muestra un aviso visible "[Pendiente: …]" en lugar de inventarlo.
import { getSettings } from '../db.js';
import { aiEnabled } from '../services/chatbot.js';
import { retentionMonths } from '../services/retention.js';
import { config } from '../config.js';

// Versión estática (GitHub Pages): no hay servidor; las solicitudes viajan por WhatsApp o correo.
let STATIC = false;
export function setStaticMode(on) { STATIC = !!on; }

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pending = (label) => `<mark class="pending">[Pendiente: ${esc(label)}]</mark>`;
const val = (v, label) => (String(v || '').trim() ? esc(v) : pending(label));
const paras = (text) => esc(text).split(/\n+/).filter(Boolean).join('<br>');

function fmtDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const LEGAL_LINKS = [
  { href: '/aviso-de-privacidad', label: 'Aviso de privacidad' },
  { href: '/terminos-y-condiciones', label: 'Términos y condiciones' },
  { href: '/devoluciones-y-garantias', label: 'Devoluciones y garantías' },
  { href: '/derechos-arco', label: 'Derechos ARCO' },
];

function contactBlock(s) {
  const items = [];
  if (s.whatsapp) items.push(`WhatsApp: <a href="https://wa.me/${esc(s.whatsapp)}" rel="noopener">+${esc(s.whatsapp)}</a>`);
  if (s.phone) items.push(`Teléfono: ${esc(s.phone)}`);
  if (s.email) items.push(`Correo: <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`);
  if (!items.length) items.push(pending('teléfono, WhatsApp o correo de contacto'));
  return items.join('<br>');
}

function layout({ title, description, path, body, s }) {
  const canonical = config.siteUrl ? `<link rel="canonical" href="${esc(config.siteUrl + path)}">` : '';
  return `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · ${esc(s.businessName)}</title>
  <meta name="description" content="${esc(description)}">
  ${canonical}
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800&family=Pacifico&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="legal-page">
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  <header class="site-header scrolled">
    <div class="container header-inner">
      <a href="/" class="brand" aria-label="${esc(s.businessName)}, ir al inicio">
        <img src="/img/logo.png" alt="" width="52" height="52">
        <span class="brand-text"><span class="brand-name">${esc(s.businessName)}</span><span class="brand-sub">${esc(s.businessSubtitle)}</span></span>
      </a>
      <a href="/" class="btn btn-ghost btn-sm">← Volver al inicio</a>
    </div>
  </header>
  <main id="contenido" class="section legal">
    <article class="container narrow legal-doc">
      ${body}
    </article>
  </main>
  ${footer(s)}
</body>
</html>`;
}

export function footer(s) {
  return `<footer class="site-footer">
    <div class="container footer-inner">
      <nav class="footer-legal" aria-label="Información legal">
        ${LEGAL_LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join('')}
      </nav>
      <p class="footer-copy">© ${new Date().getFullYear()} ${esc(s.businessName)}${s.legalName ? ` · Responsable: ${esc(s.legalName)}` : ''}${s.legalAddress ? ` · ${esc(s.legalAddress)}` : ''}</p>
    </div>
  </footer>`;
}

const updated = (s) => `<p class="legal-updated">Última actualización: ${fmtDate(s.legalUpdated)}</p>`;

// ---------------------------------------------------------------------------
export function privacyPage() {
  const s = getSettings();
  const ai = aiEnabled();
  const months = retentionMonths();
  const arcoEmail = s.privacyEmail || s.email;
  const body = `
  <p class="eyebrow">Información legal</p>
  <h1>Aviso de privacidad integral</h1>
  ${updated(s)}
  <p>En cumplimiento de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, te informamos cómo tratamos los datos personales que nos proporcionas a través de este sitio.</p>

  <h2>1. Identidad y domicilio del responsable</h2>
  <p><strong>${val(s.legalName, 'nombre completo de la persona física o razón social responsable')}</strong>, que opera con el nombre comercial <strong>${esc(s.businessName)}</strong>${s.rfc ? ` (RFC ${esc(s.rfc)})` : ''}, con domicilio en ${val(s.legalAddress, 'domicilio completo del responsable')}, es responsable del tratamiento de tus datos personales.</p>
  <p>Contacto en materia de privacidad: ${arcoEmail ? `<a href="mailto:${esc(arcoEmail)}">${esc(arcoEmail)}</a>` : pending('correo para asuntos de privacidad')} · o mediante el <a href="/derechos-arco">formulario de derechos ARCO</a>.</p>

  <h2>2. Datos personales que recabamos</h2>
  ${STATIC ? `<ul>
    <li><strong>Solicitud de pedido:</strong> el formulario de esta página no guarda datos; arma un mensaje con tu nombre, número de teléfono y los detalles de tu pedido (tipo de producto, temática, tamaño, colores, cantidad, fecha, descripción y presupuesto aproximado) y lo abre en tu WhatsApp para que tú decidas enviarlo. Recibimos esos datos, y las fotografías o bocetos que adjuntes, solo cuando nos envías el mensaje. Si decides incluirlos, también el nombre o la edad de la persona festejada.</li>
    <li><strong>Solicitudes de derechos ARCO:</strong> nombre, medio de contacto y la descripción de tu solicitud, que nos llegan por WhatsApp o correo.</li>
    <li><strong>Asistente virtual:</strong> funciona dentro de tu navegador con respuestas predefinidas; lo que escribes no se envía ni se guarda.</li>
  </ul>` : `<ul>
    <li><strong>Formulario de pedido:</strong> nombre, número de teléfono y los detalles de tu pedido (tipo de producto, temática, tamaño, colores, cantidad, fecha, descripción y presupuesto aproximado). Si decides incluirlos, también el nombre o la edad de la persona festejada, fotografías de referencia y bocetos.</li>
    <li><strong>Solicitudes de derechos ARCO:</strong> nombre, medio de contacto y la descripción de tu solicitud.</li>
    <li><strong>Asistente virtual:</strong> los mensajes que escribes. No los guardamos en nuestra base de datos; te pedimos no escribir datos personales en el chat.</li>
    <li><strong>Datos técnicos:</strong> tu dirección IP se usa de forma temporal (en memoria, por minutos) para proteger el sitio contra abusos y envíos masivos.</li>
  </ul>`}
  <p><strong>No solicitamos datos personales sensibles</strong> (salud, religión, origen étnico, datos biométricos, etc.) ni datos financieros o bancarios. Por favor no los incluyas en los formularios, y evita enviar fotografías en las que aparezcan personas.</p>
  <p>Si nos proporcionas datos de otra persona (por ejemplo, el nombre del festejado o de quien recibirá el pedido), declaras contar con su autorización o, si es menor de edad, ser su madre, padre o tutor.</p>

  <h2>3. Finalidades del tratamiento</h2>
  <p><strong>Finalidades primarias</strong> (necesarias para atender tu solicitud):</p>
  <ul>
    <li>Revisar tu solicitud, elaborar la cotización y contactarte por teléfono o WhatsApp.</li>
    <li>Confirmar disponibilidad, elaborar y entregar tu pedido.</li>
    <li>Atender aclaraciones, garantías, devoluciones y solicitudes de derechos ARCO.</li>
    <li>Mantener la seguridad del sitio y prevenir el uso indebido de los formularios.</li>
  </ul>
  <p><strong>Finalidad secundaria</strong> (opcional, solo si la autorizas en el formulario): publicar fotografías del trabajo terminado en nuestra galería y redes sociales. Si no la autorizas, no afecta tu pedido. Puedes revocar esta autorización en cualquier momento.</p>
  <p><strong>No usamos tus datos para publicidad, no los vendemos y no enviamos promociones.</strong></p>

  <h2>4. Transferencias y proveedores</h2>
  <p>No transferimos tus datos personales a terceros sin tu consentimiento, salvo en los casos de excepción previstos por la ley o por requerimiento de una autoridad competente.</p>
  <p>Para operar el sitio nos apoyamos en proveedores que tratan datos únicamente por nuestra cuenta y bajo nuestras instrucciones (encargados):</p>
  <ul>
    ${STATIC
      ? '<li>GitHub Pages (GitHub, Inc.), que aloja y entrega este sitio y puede registrar tu dirección IP al visitarlo.</li><li>WhatsApp (Meta), por donde nos envías tu solicitud; esa comunicación también se rige por el aviso de privacidad de WhatsApp.</li>'
      : '<li>El proveedor de alojamiento web, donde se guarda la información del sitio.</li>'}
    ${ai && !STATIC ? '<li><strong>Anthropic, PBC</strong> (Estados Unidos), que procesa los mensajes del asistente virtual para generar respuestas automáticas. El asistente es un programa de inteligencia artificial, no una persona.</li>' : ''}
    <li>Google Fonts (Google LLC), que entrega las tipografías del sitio y puede recibir tu dirección IP al cargarlas.</li>
  </ul>
  ${STATIC ? '' : '<p>Si decides escribirnos por WhatsApp, esa comunicación también se rige por el aviso de privacidad de WhatsApp (Meta).</p>'}

  <h2>5. Derechos ARCO y revocación del consentimiento</h2>
  <p>Tienes derecho a <strong>acceder</strong> a tus datos, <strong>rectificarlos</strong> si son inexactos, <strong>cancelarlos</strong> cuando consideres que no se requieren para las finalidades señaladas y <strong>oponerte</strong> a su tratamiento para fines específicos. También puedes <strong>revocar tu consentimiento</strong> y <strong>limitar el uso o divulgación</strong> de tus datos.</p>
  <p>Para hacerlo, envía tu solicitud mediante el <a href="/derechos-arco">formulario de derechos ARCO</a>${arcoEmail ? ` o al correo <a href="mailto:${esc(arcoEmail)}">${esc(arcoEmail)}</a>` : ''}, indicando:</p>
  <ul>
    <li>Tu nombre y un medio para comunicarte la respuesta.</li>
    <li>El derecho que deseas ejercer y una descripción clara de los datos involucrados.</li>
    <li>En su caso, el folio de tu solicitud de pedido y cualquier dato que facilite localizar tu información.</li>
  </ul>
  <p>Para proteger tus datos, antes de entregar o modificar información te pediremos <strong>acreditar tu identidad</strong> (o la de tu representante) mostrando una identificación oficial por un medio seguro. <strong>No envíes copias de identificaciones por el formulario.</strong></p>
  <p>Te comunicaremos la respuesta en un plazo máximo de <strong>20 días</strong> contados desde que recibamos tu solicitud y, si resulta procedente, la haremos efectiva dentro de los <strong>15 días</strong> siguientes. Estos plazos podrán ampliarse una sola vez por un periodo igual cuando las circunstancias lo justifiquen, lo cual te informaremos. El ejercicio de estos derechos es gratuito.</p>

  <h2>6. Conservación de los datos</h2>
  ${STATIC
    ? `<p>Conservamos las conversaciones e imágenes de tu solicitud únicamente el tiempo necesario para atenderla. Las de pedidos entregados o cancelados las eliminamos a más tardar <strong>${months} ${months === 1 ? 'mes' : 'meses'}</strong> después de recibirlas. Puedes pedir que se eliminen antes mediante una solicitud de cancelación.</p>`
    : `<p>Conservamos las solicitudes de pedido únicamente el tiempo necesario para atenderlas. Las solicitudes entregadas o canceladas se eliminan automáticamente <strong>${months} ${months === 1 ? 'mes' : 'meses'}</strong> después de su recepción, junto con sus fotografías y bocetos. Puedes pedir que se eliminen antes mediante una solicitud de cancelación.</p>`}

  <h2>7. Cookies y tecnologías similares</h2>
  ${STATIC
    ? '<p>Este sitio <strong>no usa cookies</strong>. Solo guarda temporalmente la conversación del asistente en tu navegador (se borra al cerrar la pestaña).</p>'
    : '<p>Este sitio <strong>no usa cookies de publicidad ni de rastreo</strong>. Solo usa una cookie técnica para la sesión del panel de administración del negocio y guarda temporalmente la conversación del asistente en tu navegador (se borra al cerrar la pestaña).</p>'}

  <h2>8. Medidas de seguridad</h2>
  ${STATIC
    ? '<p>El sitio funciona con conexión cifrada (HTTPS) y no almacena los datos de los formularios: la información solo sale de tu dispositivo cuando decides enviar el mensaje. El acceso a las conversaciones del negocio está protegido en su cuenta de WhatsApp.</p>'
    : '<p>El sitio funciona con conexión cifrada (HTTPS), el acceso a las solicitudes está restringido con usuario y contraseña, y las imágenes que envías no son públicas.</p>'}

  <h2>9. Cambios a este aviso</h2>
  <p>Cualquier cambio a este aviso de privacidad se publicará en esta misma página, con la fecha de su última actualización.</p>

  <h2>10. Autoridad</h2>
  <p>Si consideras que tu derecho a la protección de datos personales ha sido vulnerado, puedes acudir a la autoridad competente en la materia, la Secretaría Anticorrupción y Buen Gobierno.</p>`;
  return layout({ title: 'Aviso de privacidad', description: `Aviso de privacidad de ${s.businessName}: qué datos recabamos, para qué y cómo ejercer tus derechos ARCO.`, path: '/aviso-de-privacidad', body, s });
}

// ---------------------------------------------------------------------------
export function termsPage() {
  const s = getSettings();
  const body = `
  <p class="eyebrow">Información legal</p>
  <h1>Términos y condiciones</h1>
  ${updated(s)}
  <p>Estos términos regulan el uso de este sitio y la contratación de los productos que elabora <strong>${esc(s.businessName)}</strong>. Al enviar una solicitud aceptas estos términos.</p>

  <h2>1. Datos del proveedor</h2>
  <p>
    Responsable: <strong>${val(s.legalName, 'nombre completo o razón social')}</strong>${s.rfc ? ` · RFC ${esc(s.rfc)}` : ''}<br>
    Domicilio: ${val(s.legalAddress, 'domicilio físico del negocio')}<br>
    ${contactBlock(s)}${s.hours ? `<br>Horario de atención: ${esc(s.hours)}` : ''}
  </p>

  <h2>2. Uso del sitio</h2>
  <p>Este sitio es informativo y permite enviar solicitudes de cotización. <strong>No se realizan ventas ni cobros en línea</strong>: el sitio no solicita ni almacena datos de tarjetas o cuentas bancarias. Te comprometes a proporcionar información veraz y a no usar los formularios para enviar contenido ilícito, ofensivo o publicidad no solicitada.</p>

  <h2>3. Cómo se forma un pedido</h2>
  <ol>
    <li>Envías tu solicitud con los detalles de lo que necesitas. <strong>La solicitud no es un pedido confirmado</strong> ni obliga a ninguna de las partes.</li>
    <li>Revisamos la viabilidad y te enviamos por escrito (WhatsApp, mensaje o correo) una <strong>cotización</strong> con la descripción del producto, el <strong>precio total en moneda nacional</strong> (incluyendo impuestos aplicables), el costo de envío si lo hay, las formas de pago, el anticipo requerido y la fecha estimada de entrega.</li>
    <li>El pedido queda confirmado cuando aceptas la cotización y nosotros te confirmamos por escrito${s.depositInfo ? ', una vez cubierto el anticipo indicado' : ''}.</li>
  </ol>
  <p>El asistente virtual del sitio es un programa automatizado de orientación: no puede dar precios, confirmar pedidos ni comprometer fechas. Lo que prevalece es lo que acuerdes directamente con el negocio.</p>

  <h2>4. Precios</h2>
  <p>No manejamos precios fijos porque cada producto es personalizado. El precio depende del tamaño, el diseño, la complejidad, los materiales y la personalización, y se informa en la cotización como precio total. La cotización indicará su vigencia; pasado ese plazo podrá actualizarse.</p>

  <h2>5. Formas de pago</h2>
  <p>${s.paymentInfo ? paras(s.paymentInfo) : pending('formas de pago aceptadas (efectivo, transferencia, etc.)')}</p>
  <p>Realiza pagos únicamente por los medios que te confirmemos en nuestros canales de contacto oficiales.</p>

  <h2>6. Anticipos y cancelaciones</h2>
  <p>${s.depositInfo ? paras(s.depositInfo) : pending('política de anticipo y de cancelación del pedido')}</p>

  <h2>7. Entrega, costos de envío y tiempos</h2>
  <p><strong>Entrega:</strong> ${s.deliveryInfo ? paras(s.deliveryInfo) : pending('forma de entrega (recolección, envío, zonas)')}</p>
  <p><strong>Costos de envío:</strong> ${s.shippingInfo ? paras(s.shippingInfo) : pending('costos de envío o cómo se calculan')}</p>
  <p><strong>Tiempos de elaboración:</strong> ${s.leadTimeInfo ? paras(s.leadTimeInfo) : pending('tiempos de elaboración y entrega')}</p>

  <h2>8. Productos artesanales</h2>
  <p>Cada pieza se elabora a mano, por lo que puede presentar ligeras variaciones de color, forma o acabado respecto a las fotografías, bocetos o referencias, sin que ello se considere un defecto. Las referencias sirven como guía de diseño.</p>

  <h2>9. Imágenes de referencia y personajes</h2>
  <p>Al enviar imágenes declaras tener derecho a compartirlas. Los productos inspirados en personajes son piezas artesanales decorativas hechas por encargo; no son productos oficiales ni licenciados, y ${esc(s.businessName)} no tiene relación con los titulares de esas marcas o personajes. Podemos declinar solicitudes que consideremos inviables o inapropiadas.</p>
  <p>Los textos, fotografías y el logotipo de este sitio pertenecen a ${esc(s.businessName)} y no pueden usarse sin autorización. Los contenidos del sitio fueron revisados y aprobados por el negocio.</p>

  <h2>10. Garantías y devoluciones</h2>
  <p>Consulta nuestra <a href="/devoluciones-y-garantias">política de devoluciones y garantías</a>.</p>

  <h2>11. Datos personales</h2>
  <p>El tratamiento de tus datos se rige por nuestro <a href="/aviso-de-privacidad">aviso de privacidad</a>.</p>

  <h2>12. Legislación aplicable</h2>
  <p>Estos términos se rigen por las leyes de los Estados Unidos Mexicanos, en particular la Ley Federal de Protección al Consumidor. Nada de lo aquí establecido limita los derechos que dicha ley te otorga. Para cualquier queja puedes acudir a la Procuraduría Federal del Consumidor (PROFECO).</p>

  <h2>13. Cambios</h2>
  <p>Podemos actualizar estos términos; la versión vigente es la publicada en esta página. Los cambios no afectan pedidos ya confirmados.</p>`;
  return layout({ title: 'Términos y condiciones', description: `Términos y condiciones de ${s.businessName}: cómo se forma un pedido, precios, pagos, entregas y garantías.`, path: '/terminos-y-condiciones', body, s });
}

// ---------------------------------------------------------------------------
export function returnsPage() {
  const s = getSettings();
  const days = Number.parseInt(s.returnsDays, 10);
  const daysText = Number.isInteger(days) && days > 0 ? `<strong>${days} días naturales</strong>` : pending('número de días para reportar un problema');
  const body = `
  <p class="eyebrow">Información legal</p>
  <h1>Política de devoluciones y garantías</h1>
  ${updated(s)}
  <p>Queremos que tu pedido llegue tal como lo acordamos. Esta política explica qué hacer si algo no está bien.</p>

  <h2>1. Productos personalizados</h2>
  <p>Nuestros productos se elaboran a mano y a la medida de cada solicitud. Por eso, antes de comenzar, te enviamos una cotización con la descripción de lo acordado; esa descripción es la referencia para cualquier aclaración.</p>

  <h2>2. Revisa tu pedido al recibirlo</h2>
  <p>Te recomendamos revisar el producto en el momento de la entrega o recolección. Si notas algún problema, avísanos de inmediato.</p>

  <h2>3. Garantía</h2>
  <p>Si el producto presenta un defecto de elaboración o no corresponde a lo acordado en la cotización, repórtalo dentro de los ${daysText} siguientes a la entrega, con fotografías y tu folio de solicitud. Según el caso y conforme a la Ley Federal de Protección al Consumidor, podrás elegir entre:</p>
  <ul>
    <li>la <strong>reparación</strong> o corrección del producto,</li>
    <li>la <strong>reposición</strong> del producto, o</li>
    <li>la <strong>devolución de la cantidad pagada</strong>.</li>
  </ul>

  <h2>4. Qué no cubre la garantía</h2>
  <ul>
    <li>Daños causados después de la entrega por golpes, humedad, calor, transporte por cuenta del cliente o uso inadecuado.</li>
    <li>El rompimiento propio de una piñata al usarse para su fin.</li>
    <li>Variaciones ligeras de color, forma o acabado propias del trabajo artesanal.</li>
    <li>Cambios de diseño solicitados después de confirmar el pedido.</li>
  </ul>

  <h2>5. Cancelaciones</h2>
  <p>${s.depositInfo ? paras(s.depositInfo) : pending('qué pasa con el anticipo si el cliente cancela')}</p>
  <p>Si no podemos elaborar o entregar tu pedido por causas atribuibles a nosotros, te devolveremos íntegramente lo que hayas pagado.</p>
  <p>Cuando la contratación se haga a distancia, conservas los derechos que te otorga la Ley Federal de Protección al Consumidor, incluido, en su caso, el de revocar tu consentimiento en los términos de su artículo 56.</p>

  <h2>6. Cómo solicitar una garantía o devolución</h2>
  <p>${contactBlock(s)}</p>
  <p>Te responderemos lo antes posible para acordar la solución. Las devoluciones de dinero se realizan por el mismo medio de pago utilizado, salvo que acordemos otro.</p>

  <h2>7. PROFECO</h2>
  <p>Si no quedas satisfecho con la atención, puedes acudir a la Procuraduría Federal del Consumidor: Teléfono del Consumidor 55 5568 8722 y 800 468 8722, o en <a href="https://www.gob.mx/profeco" rel="noopener">gob.mx/profeco</a>.</p>`;
  return layout({ title: 'Devoluciones y garantías', description: `Política de devoluciones y garantías de ${s.businessName}.`, path: '/devoluciones-y-garantias', body, s });
}

// ---------------------------------------------------------------------------
export const ARCO_RIGHTS = [
  'Acceso', 'Rectificación', 'Cancelación', 'Oposición', 'Revocación del consentimiento', 'Limitación del uso o divulgación',
];

export function arcoPage({ sent = '', error = '', values = {} } = {}) {
  const s = getSettings();
  const v = (k) => esc(values[k] || '');
  const body = sent
    ? `
  <p class="eyebrow">Derechos ARCO</p>
  <h1>Solicitud recibida</h1>
  <div class="legal-success">
    <p>Tu folio es <strong>${esc(sent)}</strong>. Guárdalo para dar seguimiento.</p>
    <p>Te contactaremos al medio que indicaste. Antes de entregar o modificar información te pediremos acreditar tu identidad. Te responderemos en un plazo máximo de 20 días.</p>
  </div>
  <p><a class="btn btn-primary" href="/">Volver al inicio</a></p>`
    : `
  <p class="eyebrow">Protección de datos personales</p>
  <h1>Ejerce tus derechos ARCO</h1>
  <p>Puedes solicitar el <strong>acceso</strong>, la <strong>rectificación</strong> o la <strong>cancelación</strong> de tus datos personales, <strong>oponerte</strong> a su uso, <strong>revocar</strong> tu consentimiento o <strong>limitar</strong> su uso o divulgación. El trámite es gratuito. Más información en el <a href="/aviso-de-privacidad">aviso de privacidad</a>.</p>
  ${s.privacyEmail || s.email ? `<p>También puedes escribir a <a href="mailto:${esc(s.privacyEmail || s.email)}">${esc(s.privacyEmail || s.email)}</a>.</p>` : ''}
  ${error ? `<p class="error legal-error" role="alert">${esc(error)}</p>` : ''}
  <form class="form-card arco-form" method="post" action="/derechos-arco">
    <div class="hp" aria-hidden="true"><label>Sitio web <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    <input type="hidden" name="started_at" value="${Date.now()}">
    <div class="grid-2">
      <div class="field"><label for="a-name">Nombre completo <span class="req">*</span></label><input id="a-name" name="name" type="text" maxlength="100" required value="${v('name')}"></div>
      <div class="field"><label for="a-contact">Teléfono o correo para responderte <span class="req">*</span></label><input id="a-contact" name="contact" type="text" maxlength="120" required value="${v('contact')}"></div>
      <div class="field"><label for="a-right">Derecho que deseas ejercer <span class="req">*</span></label>
        <select id="a-right" name="right_type" required>
          <option value="">Selecciona…</option>
          ${ARCO_RIGHTS.map((r) => `<option${values.right_type === r ? ' selected' : ''}>${r}</option>`).join('')}
        </select></div>
      <div class="field"><label for="a-order">Folio de tu solicitud de pedido <span class="optional">(si lo tienes)</span></label><input id="a-order" name="order_code" type="text" maxlength="30" placeholder="KF-…" value="${v('order_code')}"></div>
    </div>
    <div class="field"><label for="a-desc">Describe tu solicitud y los datos involucrados <span class="req">*</span></label>
      <textarea id="a-desc" name="description" rows="5" maxlength="2000" required>${v('description')}</textarea>
      <p class="hint">No incluyas copias de identificaciones ni datos sensibles. Te pediremos acreditar tu identidad por un medio seguro.</p></div>
    <label class="check-line"><input type="checkbox" name="is_owner" value="1" required> Declaro que soy el titular de los datos o su representante legal. <span class="req">*</span></label>
    <div class="form-actions"><button class="btn btn-primary btn-lg" type="submit">Enviar solicitud</button></div>
  </form>`;
  return layout({ title: 'Derechos ARCO', description: `Ejerce tus derechos de acceso, rectificación, cancelación y oposición ante ${s.businessName}.`, path: '/derechos-arco', body, s });
}
