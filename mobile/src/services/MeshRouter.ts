import { EncryptedPayload } from '../types';

export type MeshEnvelope = {
  p: EncryptedPayload; // encrypted payload
  ttl: number;
  hops: string[];
};

export const MeshRouter = {
  wrap(payload: EncryptedPayload, ttl: number, hops: string[] = []): EncryptedPayload {
    const envelope: MeshEnvelope = { p: payload, ttl, hops };
    return JSON.stringify(envelope);
  },

  unwrap(raw: EncryptedPayload): { payload: EncryptedPayload; ttl: number; hops: string[]; wrapped: boolean } {
    try {
      const parsed = JSON.parse(raw) as Partial<MeshEnvelope>;
      if (parsed && typeof parsed === 'object' && typeof parsed.p === 'string') {
        return {
          payload: parsed.p,
          ttl: typeof parsed.ttl === 'number' ? parsed.ttl : 0,
          hops: Array.isArray(parsed.hops) ? parsed.hops.map(String) : [],
          wrapped: true
        };
      }
    } catch {
      // not wrapped
    }

    return { payload: raw, ttl: 0, hops: [], wrapped: false };
  }
};
