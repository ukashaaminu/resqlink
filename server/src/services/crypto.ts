import crypto from 'crypto';
import { SERVER_PRIVATE_KEY, SERVER_PUBLIC_KEY } from '../config';
import { SOSPayload } from '../types';

export class CryptoService {
  static decryptPayload(encryptedPayload: string): SOSPayload {
    try {
      const parsed = JSON.parse(encryptedPayload) as { k: string; iv: string; d: string };

      if (!parsed.k || !parsed.iv || !parsed.d) {
        throw new Error('Invalid encrypted payload shape');
      }

      // 1) RSA decrypt AES key (Base64 string)
      const aesKeyBase64 = CryptoService.decryptWithPrivateKey(parsed.k);
      const aesKey = Buffer.from(aesKeyBase64, 'base64');
      const iv = Buffer.from(parsed.iv, 'base64');

      // 2) AES decrypt data (Base64 ciphertext)
      const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
      const decrypted = Buffer.concat([
        decipher.update(parsed.d, 'base64'),
        decipher.final()
      ]).toString('utf8');

      return JSON.parse(decrypted) as SOSPayload;
    } catch (error) {
      throw new Error('Invalid encrypted payload');
    }
  }

  static verifySignature(content: string, signature: string): boolean {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(content);
    verifier.end();
    return verifier.verify(SERVER_PUBLIC_KEY, signature, 'base64');
  }

  static decryptWithPrivateKey(encrypted: string): string {
    return crypto.privateDecrypt(
      {
        key: SERVER_PRIVATE_KEY,
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      Buffer.from(encrypted, 'base64')
    ).toString('utf8');
  }
}
