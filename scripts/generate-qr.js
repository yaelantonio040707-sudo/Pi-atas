// Genera los códigos QR del sitio publicado (PNG para compartir, PNG y SVG para imprimir).
// Uso: npm run qr -- https://tudominio.com    (o define SITE_URL en .env)
// Comprueba antes que la URL sea pública y responda correctamente.
import 'dotenv/config';
import QRCode from 'qrcode';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = (process.argv[2] || process.env.SITE_URL || '').trim().replace(/\/+$/, '');
const outDir = path.resolve('qr');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!url) fail('Indica la URL pública: npm run qr -- https://tudominio.com');
let parsed;
try { parsed = new URL(url); } catch { fail(`"${url}" no es una URL válida.`); }
if (parsed.protocol !== 'https:') fail('La URL debe usar https://');
if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
  fail('La URL debe ser pública (no localhost ni direcciones de red local).');
}

console.log(`Comprobando ${url} …`);
try {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) fail(`El sitio respondió con estado ${res.status}. Corrige la publicación antes de generar el QR.`);
  const html = await res.text();
  if (!/Keflita/i.test(html)) console.warn('⚠ La página responde, pero no parece ser el sitio de Keflita. Revisa la URL.');
  console.log(`✓ El sitio responde correctamente (${res.status}).`);
} catch (e) {
  fail(`No se pudo abrir el sitio: ${e.message}`);
}

const opts = { errorCorrectionLevel: 'H', margin: 4, color: { dark: '#3b1d6e', light: '#ffffff' } };
await fs.mkdir(outDir, { recursive: true });
await QRCode.toFile(path.join(outDir, 'qr-keflita.png'), url, { ...opts, width: 1024 });
await QRCode.toFile(path.join(outDir, 'qr-keflita-imprimir.png'), url, { ...opts, width: 3000 });
await fs.writeFile(path.join(outDir, 'qr-keflita-imprimir.svg'), await QRCode.toString(url, { ...opts, type: 'svg' }));

console.log(`✓ Códigos QR generados en ${outDir}:
  · qr-keflita.png            (1024 px, para redes y WhatsApp)
  · qr-keflita-imprimir.png   (3000 px, para imprimir hasta ~25 cm a 300 ppp)
  · qr-keflita-imprimir.svg   (vectorial, cualquier tamaño)
Escanéalo con tu celular antes de imprimir.`);
