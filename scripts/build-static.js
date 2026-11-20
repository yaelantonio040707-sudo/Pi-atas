// Genera la versión estática del sitio (para GitHub Pages) en la carpeta docs/.
// Uso: npm run build:static            (datos en static-site.json)
//      npm run build:static -- otra/carpeta
// Funciona igual que el sitio con servidor, salvo que los pedidos y las solicitudes ARCO
// se envían por WhatsApp (o correo) y no hay panel de administración.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'docs');
const cfg = JSON.parse(fs.readFileSync(process.env.STATIC_CONFIG || path.join(ROOT, 'static-site.json'), 'utf8'));
const siteUrl = String(cfg.siteUrl || '').replace(/\/+$/, '');

// Base de datos temporal con los datos iniciales + los de static-site.json (no toca data/).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'keflita-static-'));
process.env.SITE_URL = siteUrl;
process.env.ANTHROPIC_API_KEY = ''; // la versión estática no usa IA
const { saveSettings, getSettings, listGallery, listFaqs, CATEGORIES } = await import('../server/db.js');
const pages = await import('../server/legal/pages.js');
pages.setStaticMode(true);
saveSettings(Object.fromEntries(Object.entries(cfg.settings || {}).map(([k, v]) => [k, k === 'whatsapp' ? String(v).replace(/\D/g, '') : v])));

const PUBLIC = path.join(ROOT, 'public');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const copyDir = (from, to) => fs.cpSync(from, to, { recursive: true });
copyDir(path.join(PUBLIC, 'css'), path.join(OUT, 'css'));
copyDir(path.join(PUBLIC, 'img'), path.join(OUT, 'img'));
copyDir(path.join(PUBLIC, 'js'), path.join(OUT, 'js'));
fs.rmSync(path.join(OUT, 'js', 'admin.js'), { force: true });
fs.rmSync(path.join(OUT, 'css', 'admin.css'), { force: true });
for (const f of ['favicon.ico', 'site.webmanifest']) fs.copyFileSync(path.join(PUBLIC, f), path.join(OUT, f));
for (const f of ['static-api.js', 'arco-static.js']) fs.copyFileSync(path.join(ROOT, 'static', f), path.join(OUT, 'js', f));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// Datos del sitio para el navegador (sin información interna)
const s = getSettings();
const PUBLIC_KEYS = ['businessName', 'businessSubtitle', 'tagline', 'heroText', 'aboutText', 'aboutExtra', 'whatsapp', 'phone',
  'email', 'location', 'hours', 'facebook', 'instagram', 'tiktok', 'deliveryInfo', 'paymentInfo', 'leadTimeInfo', 'shippingInfo',
  'depositInfo', 'returnsDays', 'legalName', 'legalAddress', 'privacyEmail'];
const data = {
  site: Object.fromEntries(PUBLIC_KEYS.map((k) => [k, s[k] || ''])),
  categories: CATEGORIES,
  gallery: listGallery().filter((g) => g.photos.length).map(({ visible, sort, ...g }) => ({
    ...g, photos: g.photos.map((p) => ({ ...p, url: p.url.replace(/^\//, '') })),
  })),
  faqs: listFaqs().map(({ id, question, answer, keywords }) => ({ id, question, answer, keywords })),
};
fs.writeFileSync(path.join(OUT, 'js', 'site-data.js'), `window.__KEFLITA__ = ${JSON.stringify(data)};\n`);

const LEGAL = {
  '/aviso-de-privacidad': ['aviso-de-privacidad.html', pages.privacyPage],
  '/terminos-y-condiciones': ['terminos-y-condiciones.html', pages.termsPage],
  '/devoluciones-y-garantias': ['devoluciones-y-garantias.html', pages.returnsPage],
  '/derechos-arco': ['derechos-arco.html', pages.arcoPage],
};
function relativize(html) {
  for (const [route, [file]] of Object.entries(LEGAL)) html = html.replaceAll(`href="${route}"`, `href="${file}"`);
  return html
    .replaceAll('href="/"', 'href="./"')
    .replace(/(href|src)="\/(css|js|img)\//g, '$1="$2/')
    .replaceAll('href="/favicon.ico"', 'href="favicon.ico"')
    .replaceAll('href="/site.webmanifest"', 'href="site.webmanifest"')
    .replace(/<link rel="canonical" href="[^"]*">/, (m) => (siteUrl ? m.replace(/\/(aviso|terminos|devoluciones|derechos)[^"]*/, (p) => `${p}.html`) : ''));
}

// Página principal
let index = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
index = relativize(index).replace(
  '<script src="js/main.js" type="module"></script>',
  '<script src="js/site-data.js"></script>\n  <script src="js/static-api.js"></script>\n  <script src="js/main.js" type="module"></script>'
);
if (siteUrl) {
  index = index
    .replace('<meta property="og:image" content="/img/og-image.jpg">', `<meta property="og:image" content="${siteUrl}/img/og-image.jpg">`)
    .replace('<meta property="og:type" content="website">', `<meta property="og:type" content="website">\n  <meta property="og:url" content="${siteUrl}/">\n  <link rel="canonical" href="${siteUrl}/">`);
}
fs.writeFileSync(path.join(OUT, 'index.html'), index);

// Páginas legales
for (const [, [file, render]] of Object.entries(LEGAL)) {
  let html = relativize(render());
  if (file === 'derechos-arco.html') {
    html = html.replace('</body>', '<script src="js/site-data.js"></script>\n<script src="js/arco-static.js"></script>\n</body>');
  }
  fs.writeFileSync(path.join(OUT, file), html);
}

// Página 404 (GitHub Pages la muestra en cualquier ruta, así que usa la dirección completa)
const base = siteUrl ? `${siteUrl}/` : './';
fs.writeFileSync(path.join(OUT, '404.html'), fs.readFileSync(path.join(PUBLIC, '404.html'), 'utf8')
  .replaceAll('href="/"', `href="${base}"`).replace(/(href|src)="\/(css|img)\//g, `$1="${base}$2/`).replaceAll('href="/favicon.ico"', `href="${base}favicon.ico"`));

// SEO y código QR (solo con la dirección pública definitiva)
if (siteUrl) {
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
  const urls = ['/', ...Object.values(LEGAL).map(([f]) => `/${f}`)];
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${siteUrl}${u}</loc></url>`).join('')}</urlset>\n`);
  const qrOpts = { errorCorrectionLevel: 'H', margin: 4, color: { dark: '#3b1d6e', light: '#ffffff' } };
  await QRCode.toFile(path.join(OUT, 'qr-keflita.png'), `${siteUrl}/`, { ...qrOpts, width: 1024 });
}

fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
const pending = ['whatsapp', 'legalName', 'legalAddress', 'paymentInfo'].filter((k) => !s[k]);
console.log(`✓ Sitio estático generado en ${path.relative(ROOT, OUT)}/ (${data.gallery.length} trabajos)`);
if (!siteUrl) console.log('· Sin siteUrl en static-site.json: no se generaron sitemap ni código QR.');
if (pending.length) console.log(`· Datos pendientes en static-site.json: ${pending.join(', ')}`);
