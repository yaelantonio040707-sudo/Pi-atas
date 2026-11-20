// Validación y limpieza de datos de entrada.
export const PRODUCT_TYPES = ['Piñata', 'Sombrero', 'Decoración', 'Accesorio', 'Otro'];
export const ORDER_STATUSES = ['nuevo', 'en revisión', 'cotizado', 'confirmado', 'entregado', 'cancelado'];

export const clean = (v, max = 500) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);

function todayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1); // margen por diferencias de zona horaria
  return d.toISOString().slice(0, 10);
}

/** Valida el formulario de pedido. Devuelve { data, errors }. */
export function validateOrder(body) {
  const errors = {};
  const data = {
    name: clean(body.name, 80),
    phone: clean(body.phone, 30),
    product_type: clean(body.product_type, 30),
    product_other: clean(body.product_other, 80),
    size: clean(body.size, 120),
    theme: clean(body.theme, 200),
    colors: clean(body.colors, 200),
    quantity: Number.parseInt(body.quantity, 10),
    needed_date: clean(body.needed_date, 10),
    description: clean(body.description, 3000),
    budget: clean(body.budget, 80),
  };

  if (data.name.length < 2) errors.name = 'Escribe tu nombre.';
  const digits = data.phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15 || !/^[\d\s()+.-]+$/.test(data.phone)) {
    errors.phone = 'Escribe un número de contacto válido (8 a 15 dígitos).';
  }
  if (!PRODUCT_TYPES.includes(data.product_type)) errors.product_type = 'Elige el tipo de producto.';
  if (data.product_type === 'Otro' && data.product_other.length < 2) errors.product_other = 'Cuéntanos qué producto necesitas.';
  if (data.product_type !== 'Otro') data.product_other = '';
  if (data.theme.length < 2) errors.theme = 'Indica el personaje, animal, temática o diseño.';
  if (!Number.isInteger(data.quantity) || data.quantity < 1 || data.quantity > 500) errors.quantity = 'Indica una cantidad entre 1 y 500.';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.needed_date) || Number.isNaN(Date.parse(data.needed_date))) {
    errors.needed_date = 'Indica la fecha para la que necesitas el pedido.';
  } else if (data.needed_date < todayISO()) {
    errors.needed_date = 'La fecha no puede ser anterior a hoy.';
  }
  return { data, errors };
}

/** Señales de spam: campo trampa lleno o formulario enviado demasiado rápido. */
export function looksLikeSpam(body) {
  if (clean(body.website)) return true; // campo oculto que solo llenan los bots
  const started = Number(body.started_at);
  if (!Number.isFinite(started)) return true;
  const elapsed = Date.now() - started;
  return elapsed < 4000 || elapsed > 1000 * 60 * 60 * 24;
}
