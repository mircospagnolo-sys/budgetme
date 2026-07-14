/* BudgetMe — crypto.js
   Cifratura/decifratura AES-256-GCM via Web Crypto API (built-in browser)
   La chiave viene derivata dalla password utente tramite PBKDF2
   Nessuna libreria esterna richiesta */

const PBKDF2_ITERATIONS = 310000; // OWASP 2023 raccomandazione
const KEY_LENGTH = 256;

// Converti stringa in Uint8Array
function str2ab(str) {
  return new TextEncoder().encode(str);
}

// Converti Uint8Array in stringa base64
function ab2b64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// Converti base64 in Uint8Array
function b642ab(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Genera salt casuale (16 byte)
export function generateSalt() {
  return ab2b64(crypto.getRandomValues(new Uint8Array(16)));
}

// Deriva chiave AES-256 dalla password e dal salt (PBKDF2)
async function deriveKey(password, saltB64) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', str2ab(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b642ab(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// Cifra un oggetto JS → stringa base64 (iv + dati cifrati)
export async function encrypt(data, password, saltB64) {
  const key = await deriveKey(password, saltB64);
  const iv  = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    str2ab(JSON.stringify(data))
  );
  // Prefissa IV ai dati cifrati per poterlo recuperare in decifratura
  const combined = new Uint8Array(iv.byteLength + enc.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(enc), iv.byteLength);
  return ab2b64(combined);
}

// Decifra stringa base64 → oggetto JS
export async function decrypt(encryptedB64, password, saltB64) {
  const key      = await deriveKey(password, saltB64);
  const combined = b642ab(encryptedB64);
  const iv       = combined.slice(0, 12);
  const data     = combined.slice(12);
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return JSON.parse(new TextDecoder().decode(dec));
}

// Genera hash della password per verifica (non reversibile)
export async function hashPassword(password, saltB64) {
  const key = await deriveKey(password, saltB64);
  // Cifra una stringa nota — se la decifratura funziona, la password è corretta
  return encrypt({ __verify: 'budgetme_ok' }, password, saltB64);
}

// Verifica se la password è corretta
export async function verifyPassword(password, saltB64, verifyToken) {
  try {
    const result = await decrypt(verifyToken, password, saltB64);
    return result?.__verify === 'budgetme_ok';
  } catch {
    return false;
  }
}
