/**
 * Minimal Board Tab - WebCrypto E2E Encryption Engine (AES-GCM & PBKDF2)
 * Pure ES module. Zero external dependencies.
 */

const PBKDF2_ITERATIONS = 250000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;

function getCrypto() {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto;
  }
  throw new Error('WebCrypto API (crypto.subtle) is not available.');
}

function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives an AES-GCM 256-bit key from a user passphrase and salt using PBKDF2.
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(passphrase, salt) {
  const subtle = getCrypto().subtle;
  const enc = new TextEncoder();
  const passphraseKey = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts arbitrary data (object or string) with a passphrase.
 *
 * @param {any} data
 * @param {string} passphrase
 * @returns {Promise<{ salt: string, iv: string, ciphertext: string, v: number }>}
 */
export async function encryptData(data, passphrase) {
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('A non-empty passphrase is required for encryption.');
  }

  const c = getCrypto();
  const salt = c.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = c.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

  const key = await deriveKey(passphrase, salt);
  const plainText = typeof data === 'string' ? data : JSON.stringify(data);
  const encodedData = new TextEncoder().encode(plainText);

  const cipherBuffer = await c.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  );

  return {
    v: 1,
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(cipherBuffer),
  };
}

/**
 * Decrypts an encrypted package with a passphrase.
 *
 * @param {{ salt: string, iv: string, ciphertext: string }} pkg
 * @param {string} passphrase
 * @returns {Promise<any>} Parsed decrypted data
 */
export async function decryptData(pkg, passphrase) {
  if (!pkg || !pkg.salt || !pkg.iv || !pkg.ciphertext) {
    throw new Error('Malformed encryption package.');
  }
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('A passphrase is required for decryption.');
  }

  const salt = new Uint8Array(base64ToBuffer(pkg.salt));
  const iv = new Uint8Array(base64ToBuffer(pkg.iv));
  const cipherBuffer = base64ToBuffer(pkg.ciphertext);

  const key = await deriveKey(passphrase, salt);
  const c = getCrypto();

  try {
    const decryptedBuffer = await c.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBuffer
    );
    const decodedText = new TextDecoder().decode(decryptedBuffer);
    try {
      return JSON.parse(decodedText);
    } catch {
      return decodedText;
    }
  } catch {
    throw new Error('Decryption failed: Incorrect passphrase or corrupted data.');
  }
}
