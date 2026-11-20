// Conservación de datos: elimina automáticamente las solicitudes de pedido concluidas
// (entregadas o canceladas) cuando superan el plazo de conservación indicado en el aviso de privacidad.
import { db, getSettings } from '../db.js';
import { paths } from '../config.js';
import { deleteStoredFile } from '../lib/uploads.js';

export function retentionMonths() {
  const n = Number.parseInt(getSettings().retentionMonths, 10);
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : 12;
}

export async function purgeExpiredOrders() {
  const months = retentionMonths();
  const expired = db
    .prepare(
      `SELECT id FROM orders
       WHERE status IN ('entregado', 'cancelado') AND created_at < datetime('now', ?)`
    )
    .all(`-${months} months`);
  for (const { id } of expired) {
    const files = db.prepare('SELECT filename FROM order_files WHERE order_id = ?').all(id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    for (const f of files) await deleteStoredFile(paths.orderUploads, f.filename);
  }
  if (expired.length) console.log(`[privacidad] ${expired.length} solicitud(es) eliminada(s) por plazo de conservación.`);
  return expired.length;
}

export function scheduleRetention() {
  purgeExpiredOrders().catch((e) => console.error('[privacidad]', e));
  setInterval(() => purgeExpiredOrders().catch((e) => console.error('[privacidad]', e)), 24 * 3600_000).unref();
}
