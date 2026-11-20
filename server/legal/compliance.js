// Lista de verificación de cumplimiento legal que se muestra en el panel.
import { getSettings } from '../db.js';
import { config } from '../config.js';

export function complianceChecklist() {
  const s = getSettings();
  const has = (k) => String(s[k] || '').trim().length > 0;
  const days = Number.parseInt(s.returnsDays, 10);
  return [
    { group: 'Aviso de privacidad (LFPDPPP)', items: [
      { label: 'Nombre o razón social del responsable', ok: has('legalName'), field: 'legalName' },
      { label: 'Domicilio del responsable', ok: has('legalAddress'), field: 'legalAddress' },
      { label: 'Correo o medio para derechos ARCO', ok: has('privacyEmail') || has('email'), field: 'privacyEmail' },
      { label: 'Formulario de derechos ARCO y registro de solicitudes', ok: true },
      { label: 'Consentimiento en el formulario de pedido y aviso simplificado', ok: true },
      { label: 'Plazo de conservación y eliminación automática de solicitudes', ok: true },
    ] },
    { group: 'Información comercial (PROFECO)', items: [
      { label: 'Domicilio físico y teléfono/correo del proveedor', ok: has('legalAddress') && (has('phone') || has('whatsapp') || has('email')), field: 'legalAddress' },
      { label: 'Precios: explicación de cotización con precio total', ok: true },
      { label: 'Formas de pago', ok: has('paymentInfo'), field: 'paymentInfo' },
      { label: 'Costos de envío', ok: has('shippingInfo'), field: 'shippingInfo' },
      { label: 'Forma y tiempos de entrega', ok: has('deliveryInfo') && has('leadTimeInfo'), field: 'deliveryInfo' },
      { label: 'Anticipos y cancelaciones', ok: has('depositInfo'), field: 'depositInfo' },
      { label: 'Plazo para reportar problemas (garantía)', ok: Number.isInteger(days) && days > 0, field: 'returnsDays' },
    ] },
    { group: 'Seguridad', items: [
      { label: 'Sitio publicado con HTTPS (SITE_URL con https://)', ok: config.siteUrl.startsWith('https://') },
      { label: 'Contraseña del panel configurada', ok: !!config.admin.passwordHash },
      { label: 'El sitio no recibe pagos ni datos bancarios (no requiere pasarela)', ok: true },
    ] },
  ];
}
