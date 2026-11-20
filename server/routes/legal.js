// Páginas legales y formulario de derechos ARCO (funciona sin JavaScript).
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { clean, looksLikeSpam } from '../lib/validate.js';
import { privacyPage, termsPage, returnsPage, arcoPage, ARCO_RIGHTS } from '../legal/pages.js';

const router = Router();

const send = (render) => (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(render());
};

router.get('/aviso-de-privacidad', send(privacyPage));
router.get('/terminos-y-condiciones', send(termsPage));
router.get('/devoluciones-y-garantias', send(returnsPage));
router.get('/derechos-arco', (req, res) => {
  const folio = clean(req.query.folio, 30);
  res.set('Cache-Control', 'no-store');
  res.type('html').send(arcoPage({ sent: /^ARCO-[\w-]+$/.test(folio) ? folio : '' }));
});

const arcoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).type('html').send(arcoPage({ error: 'Has enviado varias solicitudes. Intenta de nuevo más tarde.', values: req.body })),
});

router.post('/derechos-arco', express.urlencoded({ extended: false, limit: '20kb' }), arcoLimiter, (req, res) => {
  const b = req.body || {};
  const values = {
    name: clean(b.name, 100),
    contact: clean(b.contact, 120),
    right_type: clean(b.right_type, 60),
    order_code: clean(b.order_code, 30),
    description: clean(b.description, 2000),
  };
  const fail = (error) => res.status(400).type('html').send(arcoPage({ error, values }));

  if (looksLikeSpam(b)) return fail('No pudimos procesar la solicitud. Espera unos segundos e inténtalo de nuevo.');
  if (values.name.length < 3) return fail('Escribe tu nombre completo.');
  if (values.contact.length < 6) return fail('Indica un teléfono o correo para responderte.');
  if (!ARCO_RIGHTS.includes(values.right_type)) return fail('Selecciona el derecho que deseas ejercer.');
  if (values.description.length < 10) return fail('Describe tu solicitud.');
  if (b.is_owner !== '1') return fail('Confirma que eres el titular de los datos o su representante.');

  const code = `ARCO-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  db.prepare(
    'INSERT INTO arco_requests (code, name, contact, right_type, order_code, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(code, values.name, values.contact, values.right_type, values.order_code, values.description);
  res.redirect(303, `/derechos-arco?folio=${code}`);
});

export default router;
