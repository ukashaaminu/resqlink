import crypto from 'crypto';

type MeshEnvelope = {
  p: string; // encrypted payload
  ttl?: number;
  hops?: string[];
  hash?: string;
};

type Unwrapped = {
  payload: string;
  ttl: number;
  hops: string[];
  hash: string;
};

const seenHashes: Map<string, number> = new Map();
const DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export class MeshService {
  /**
   * Accepts either a raw encrypted payload or a MeshEnvelope-wrapped payload.
   */
  static unwrapPayloadEnvelope(input: string): Unwrapped {
    const now = Date.now();
    try {
      const parsed = JSON.parse(input) as Partial<MeshEnvelope>;
      if (parsed && typeof parsed === 'object' && typeof parsed.p === 'string') {
        const ttl = typeof parsed.ttl === 'number' ? parsed.ttl : 0;
        const hops = Array.isArray(parsed.hops) ? parsed.hops.map(String) : [];
        const hash = parsed.hash && typeof parsed.hash === 'string' ? parsed.hash : MeshService.hashPayload(parsed.p);
        return { payload: parsed.p, ttl, hops, hash };
      }
    } catch {
      // fall through to treat as raw
    }

    const hash = MeshService.hashPayload(input);
    return { payload: input, ttl: 0, hops: [], hash };
  }

  static hashPayload(payload: string): string {
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  static isDuplicate(hash: string): boolean {
    const now = Date.now();
    const seenAt = seenHashes.get(hash);
    if (seenAt !== undefined && now - seenAt < DEDUPE_WINDOW_MS) {
      return true;
    }
    seenHashes.set(hash, now);

    // cleanup old entries
    for (const [key, ts] of seenHashes.entries()) {
      if (now - ts > DEDUPE_WINDOW_MS) {
        seenHashes.delete(key);
      }
    }

    return false;
  }
}
