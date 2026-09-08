const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeIdentityDocument(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

async function lookupHmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return b64url(new Uint8Array(signature));
}

export async function cpfLookupHmac(cpf: string, secret: string): Promise<string> {
  return lookupHmac(normalizeCpf(cpf), secret);
}

export async function identityLookupHmac(documentType: string, documentNumber: string, secret: string): Promise<string> {
  const type = documentType.trim().toUpperCase();
  const number = normalizeIdentityDocument(documentNumber);
  return lookupHmac(`${type}:${number}`, secret);
}

export async function encryptCpf(cpf: string, keyBase64: string): Promise<string> {
  const keyBytes = fromBase64(keyBase64);
  if (keyBytes.length !== 32) throw new Error('CPF_ENCRYPTION_KEY_B64 must decode to 32 bytes');
  const key = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(normalizeCpf(cpf)));
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(encrypted))}`;
}
