import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Uso: node scripts/generate-password-hash.mjs "senha-com-10-ou-mais-caracteres"');
  process.exit(1);
}

const iterations = 100_000;
const salt = randomBytes(16);
const derived = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const b64url = (buffer) => Buffer.from(buffer).toString('base64url');

console.log(`pbkdf2_sha256$${iterations}$${b64url(salt)}$${b64url(derived)}`);
