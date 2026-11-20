// Manejo seguro de imágenes subidas: límites de tamaño, verificación del tipo real y nombres aleatorios.
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxFileMb * 1024 * 1024,
    files: config.uploads.maxFiles + 1, // fotos de referencia + boceto
    fields: 30,
    fieldSize: 20 * 1024,
  },
});

/** Detecta el tipo real del archivo por sus primeros bytes (no se confía en la extensión). */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.toString('ascii', 0, 4) === 'GIF8') return { mime: 'image/gif', ext: 'gif' };
  return null;
}

/** Comprueba que todos los archivos sean imágenes; lanza un error 400 si alguno no lo es. */
export function assertImages(files) {
  for (const f of files) {
    if (!sniffImage(f.buffer)) {
      const err = new Error(`El archivo "${f.originalname}" no es una imagen válida (JPG, PNG, WEBP o GIF).`);
      err.status = 400;
      throw err;
    }
  }
}

/** Guarda un archivo de multer en dir con nombre aleatorio y devuelve sus metadatos. */
export async function saveImage(file, dir) {
  const type = sniffImage(file.buffer);
  if (!type) throw Object.assign(new Error('Imagen no válida.'), { status: 400 });
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${type.ext}`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), file.buffer);
  return { filename, mime: type.mime, size: file.size, original: String(file.originalname || '').slice(0, 120) };
}

/** Elimina un archivo guardado. Solo acepta nombres simples para evitar rutas maliciosas. */
export async function deleteStoredFile(dir, filename) {
  if (!/^[\w.-]+$/.test(filename)) return;
  await fs.unlink(path.join(dir, filename)).catch(() => {});
}

export const safeName = (name) => /^[\w.-]+$/.test(name);
