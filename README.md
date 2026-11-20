# Keflita · Piñatas personalizadas y manualidades

Sitio web del emprendimiento **Keflita**: muestra los trabajos realizados, explica cómo funcionan las cotizaciones, recibe pedidos personalizados (con fotos de referencia y un boceto dibujado en la página), incluye un asistente virtual y un panel privado para el negocio.

## Funcionalidades

| Área | Qué hace |
|---|---|
| **Página principal** | Presentación, frase, fotos destacadas, servicios, botones de cotización y contacto. |
| **Galería** | 18 trabajos reales (47 fotos individuales) organizados por categoría; visor ampliable con varias fotos por trabajo, flechas, deslizamiento táctil y botón «Quiero algo así» que prellena el pedido. |
| **Cotizaciones** | Explica que **no hay precios fijos** y de qué depende el precio. No se muestra ningún precio. |
| **Pedido personalizado** | Formulario validado (cliente y servidor), hasta 4 fotos de referencia, **área de dibujo** (lápiz, línea, cuadro, círculo, relleno, colores, borrador, deshacer), resumen antes de enviar y folio de solicitud. Aclara que enviar no confirma el pedido. |
| **Asistente virtual** | Disponible en todo el sitio. Con `ANTHROPIC_API_KEY` usa Claude desde el servidor (la clave nunca llega al navegador) y responde solo con la información del negocio; sin clave o si falla, responde con las preguntas frecuentes. Nunca da precios, no confirma pedidos ni promete fechas. |
| **WhatsApp** | Botón flotante y mensaje de saludo; tras enviar un pedido, opción de mandar el resumen por WhatsApp. Solo aparece cuando hay número configurado; si no, el contacto es mediante el formulario. |
| **Panel `/admin`** | Inicio de sesión; solicitudes con estados, notas internas, fotos y bocetos adjuntos (privados), contacto rápido; administración de la galería (agregar, editar, ocultar, ordenar, eliminar fotos); información del negocio y redes; preguntas frecuentes del asistente; código QR descargable. |
| **Seguridad** | Contraseña con scrypt, sesiones con cookie `HttpOnly`/`SameSite=Strict`, protección CSRF, CSP estricta (Helmet), límite de intentos de inicio de sesión, límites de envío, campo trampa y tiempo mínimo contra spam, verificación del tipo real de las imágenes. |
| **SEO** | Metadatos, Open Graph, `robots.txt`, `sitemap.xml`, página 404, sitio adaptable y accesible (teclado, lectores de pantalla, movimiento reducido). |

## Cumplimiento legal (México)

| Requisito | Cómo se cumple en el sitio |
|---|---|
| **Aviso de privacidad** (LFPDPPP 2025) | Página `/aviso-de-privacidad`: identidad y domicilio del responsable, datos recabados, finalidades primarias y secundaria opcional, proveedores (hosting, IA, tipografías), derechos ARCO, revocación y limitación, conservación, cookies, seguridad, cambios y autoridad (Secretaría Anticorrupción y Buen Gobierno). Aviso simplificado dentro del formulario de pedido. |
| **Consentimiento** | Casilla obligatoria en el formulario; se guarda la fecha y versión del aviso aceptado. La publicación de fotos del trabajo terminado es una autorización aparte y opcional. |
| **Derechos ARCO** | Formulario `/derechos-arco` (funciona sin JavaScript) con folio. En el panel: registro, estados, fecha límite de respuesta (20 días), notas, y descarga de los datos de un pedido para responder solicitudes de acceso. |
| **Conservación de datos** | Las solicitudes entregadas o canceladas se eliminan automáticamente después del plazo configurado (12 meses por defecto), con sus imágenes. |
| **Términos y condiciones** | Página `/terminos-y-condiciones`: datos del proveedor, cómo se forma un pedido, precios (total en MXN en la cotización), pagos, anticipos, entregas, productos artesanales, imágenes y personajes, asistente automatizado, ley aplicable y PROFECO. |
| **Devoluciones y garantías** | Página `/devoluciones-y-garantias`: reparación, reposición o devolución; exclusiones; cancelaciones; contacto de PROFECO. |
| **Información PROFECO** | Sección «Información de compra» en la página principal: precios, formas de pago, envío y costos, entrega y tiempos, anticipos, garantías. |
| **Seguridad** | Redirección obligatoria a HTTPS y HSTS en producción, contraseña cifrada, archivos privados, CSP. El sitio **no cobra ni pide datos bancarios**, así que no requiere pasarela de pago. |
| **Transparencia del asistente** | Se identifica como asistente automático y pide no escribir datos personales. |

Los datos que solo el negocio puede proporcionar (nombre o razón social, domicilio, correo de privacidad, formas de pago, envíos, anticipos, días de garantía) se capturan en **Panel → Negocio**. Mientras falten, las páginas legales muestran «[Pendiente: …]» y **Panel → Privacidad y legal** muestra la lista de verificación. **Completa todo antes de publicar.**

> Estos textos son una base redactada conforme a la legislación vigente, no sustituyen la asesoría de un abogado. Antes de publicar, conviene que una persona con conocimientos legales los revise.

## Tecnologías

- **Node.js 22** + **Express 5** (un solo servicio sirve el sitio y la API).
- **SQLite** con el módulo nativo `node:sqlite` (sin compilaciones ni servicios externos de base de datos).
- Frontend en **HTML, CSS y JavaScript** sin framework ni paso de compilación: rápido de cargar y fácil de mantener.
- `@anthropic-ai/sdk` para el asistente (opcional), `multer` para imágenes, `qrcode` para los códigos QR.

## Estructura

```
├── server/
│   ├── index.js            # arranque del servidor
│   ├── app.js              # Express: seguridad, rutas, estáticos, errores
│   ├── config.js           # variables de entorno
│   ├── db.js               # esquema SQLite, datos iniciales, consultas
│   ├── lib/                # autenticación, subida de imágenes, validación
│   ├── routes/             # API pública y del panel
│   ├── services/chatbot.js # asistente (IA + respaldo con preguntas frecuentes)
│   └── seed/               # textos, galería y preguntas iniciales
├── public/                 # sitio público y panel (HTML, CSS, JS, imágenes)
│   └── img/gallery/        # fotos individuales de los trabajos
├── scripts/                # generar hash de contraseña y códigos QR
├── tests/                  # pruebas de la API
├── Dockerfile · render.yaml · .env.example
```

## Instalación local

Requisitos: **Node.js 22.13 o superior**.

```bash
npm install
cp .env.example .env
npm run admin:hash          # escribe tu contraseña y copia el resultado en ADMIN_PASSWORD_HASH del .env
npm run dev                 # http://localhost:3000   ·   panel: http://localhost:3000/admin
npm test                    # pruebas
```

La primera vez se crea `data/keflita.db` con la información inicial. **La carpeta `data/` contiene los pedidos de los clientes: no se sube a GitHub** (está en `.gitignore`) y se debe respaldar.

## Configuración

Todas las variables están en [`.env.example`](.env.example). Las importantes:

| Variable | Para qué |
|---|---|
| `SITE_URL` | Dirección pública definitiva (ej. `https://keflita.com`). Necesaria para el sitemap y el QR. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | Acceso al panel. Sin el hash, el panel no permite entrar. |
| `ANTHROPIC_API_KEY` | Opcional. Activa el asistente con IA. Sin ella funciona con respuestas predefinidas. |
| `WHATSAPP_NUMBER` | Opcional. Número inicial con código de país; también se configura desde el panel. |
| `DATA_DIR` | Carpeta de la base de datos y fotos subidas (disco persistente en producción). |

Teléfono, correo, ubicación, horario, redes sociales, entregas, formas de pago y tiempos se capturan desde **Panel → Negocio**. Lo que quede vacío no se muestra y el asistente dirá que no tiene ese dato.

## Versión gratuita en GitHub Pages (sin servidor)

La carpeta `docs/` contiene una versión estática del sitio que se publica gratis en GitHub Pages. Se ve y funciona igual que la versión con servidor, con estas diferencias:

| Función | Con servidor | GitHub Pages |
|---|---|---|
| Pedidos | Se guardan en el panel | Se arma el mensaje y se abre WhatsApp para que el cliente lo envíe; el boceto se descarga para adjuntarlo |
| Derechos ARCO | Se registran en el panel | Se envían por WhatsApp (o correo) |
| Asistente | IA opcional | Respuestas predefinidas (sin IA: una clave no puede ir en un sitio estático) |
| Panel de administración | Sí | No: los datos se cambian en `static-site.json` |

**Para cambiar datos** (WhatsApp, domicilio, formas de pago, etc.): edita `static-site.json`, ejecuta `npm run build:static` y sube los cambios. **Para cambiar la galería**: edita `server/seed/gallery.json` y las fotos de `public/img/gallery/`, y vuelve a generar.

**Para activarla:** en GitHub, *Settings → Pages → Build and deployment*: *Deploy from a branch*, la rama del proyecto y la carpeta `/docs`. GitHub Pages gratuito requiere que el repositorio sea público. Después pon la dirección en `siteUrl` de `static-site.json` y vuelve a generar para crear el sitemap y `docs/qr-keflita.png`.

## Publicación

El sitio necesita un servidor Node con **disco persistente** (por la base de datos y las fotos).

**Opción A – Render:** sube el repositorio a GitHub, en Render elige *New → Blueprint* y selecciona el repositorio; `render.yaml` crea el servicio con disco. Captura las variables marcadas como secretas en el panel de Render. Después agrega tu dominio en *Settings → Custom Domains* y actualiza `SITE_URL`.

**Opción B – Docker (VPS, Railway, Fly.io…):**

```bash
docker build -t keflita .
docker run -d -p 3000:3000 -v keflita-data:/data --env-file .env keflita
```

Coloca el sitio detrás de HTTPS (el proveedor o un proxy como Caddy/Nginx) y deja `TRUST_PROXY=1`.

## Código QR

Una vez publicado el sitio y definida `SITE_URL`:

- **Panel → Código QR**: vista previa y descarga en PNG (1024 px) y versión para imprimir (3000 px).
- O en la terminal: `npm run qr -- https://tu-dominio.com` → comprueba que la URL sea pública y responda, y genera `qr/qr-keflita.png`, `qr/qr-keflita-imprimir.png` y `qr/qr-keflita-imprimir.svg`.

No se genera con `localhost`. Escanéalo con el celular antes de imprimir.

## Mantenimiento de la galería

Desde **Panel → Galería** se agregan trabajos (título, categoría, descripción, fotos), se editan, ocultan, ordenan o eliminan sin tocar el código. Las fotos nuevas se guardan en `DATA_DIR/uploads/gallery`. Las fotos iniciales están en `public/img/gallery/` y se recortaron de los collages originales; si tienes las fotos originales en mayor resolución, súbelas desde el panel para que se vean más nítidas.

## Pendiente por parte del negocio

- Número de WhatsApp, teléfono, correo, ubicación/zona, horario y redes sociales (Panel → Negocio).
- Información de entregas, formas de pago y tiempos de elaboración (para que el asistente pueda responderlas).
- Revisar los textos de «Quiénes somos» y los títulos de la galería.
- Dominio y servicio de publicación; después, `SITE_URL` y el código QR.
- (Opcional) Clave de la API de Claude para el asistente con IA.
