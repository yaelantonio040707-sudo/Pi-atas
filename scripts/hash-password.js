// Genera el valor de ADMIN_PASSWORD_HASH a partir de una contraseña.
// Uso: npm run admin:hash            (la pide sin mostrarla)
//      npm run admin:hash -- "clave" (no recomendado: queda en el historial de la terminal)
import crypto from 'node:crypto';
import readline from 'node:readline';

function hash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else rl.output.write('*'); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const password = process.argv[2] || (await ask('Contraseña para el panel: '));
if (!password || password.length < 10) {
  console.error('Usa una contraseña de al menos 10 caracteres.');
  process.exit(1);
}
console.log('\nCopia esta línea en tu archivo .env (o en las variables del servidor):\n');
console.log(`ADMIN_PASSWORD_HASH=${hash(password)}\n`);
