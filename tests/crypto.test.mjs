import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encryptData, decryptData } from '../lib/crypto.js';

describe('lib/crypto.js', () => {
  it('encrypts and decrypts an object correctly with matching passphrase', async () => {
    const payload = {
      meta: { schemaVersion: 2, app: 'Minimal Board' },
      cards: [{ id: 'c1', title: 'Secret Link', url: 'https://internal.corp' }],
    };
    const passphrase = 'my-super-secret-passphrase-123';

    const encrypted = await encryptData(payload, passphrase);
    assert.ok(encrypted.salt);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.ciphertext);

    const decrypted = await decryptData(encrypted, passphrase);
    assert.deepEqual(decrypted, payload);
  });

  it('fails safely when an incorrect passphrase is supplied', async () => {
    const payload = { test: 'confidential' };
    const encrypted = await encryptData(payload, 'correct-password');

    await assert.rejects(
      async () => {
        await decryptData(encrypted, 'wrong-password');
      },
      /Decryption failed: Incorrect passphrase/
    );
  });

  it('fails safely on corrupted ciphertext package', async () => {
    const encrypted = {
      v: 1,
      salt: 'AAAA',
      iv: 'BBBB',
      ciphertext: 'CCCC',
    };

    await assert.rejects(
      async () => {
        await decryptData(encrypted, 'password');
      },
      /Decryption failed/
    );
  });
});
