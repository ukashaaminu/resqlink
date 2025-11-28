import NetInfo from '@react-native-community/netinfo';
import { SERVER_BASE_URL } from '../config';
import { EncryptedPayload, FamilyLink, StatusRecord } from '../types';

const toJsonHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

export class APIService {
  static async hasInternet(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return Boolean(state.isConnected && state.isInternetReachable);
  }

  static async sendSOS(payload: EncryptedPayload) {
    await fetch(`${SERVER_BASE_URL}/api/sos`, {
      method: 'POST',
      headers: toJsonHeaders,
      body: JSON.stringify({ payload })
    });
  }

  static async sendStatus(payload: EncryptedPayload) {
    await fetch(`${SERVER_BASE_URL}/api/status`, {
      method: 'POST',
      headers: toJsonHeaders,
      body: JSON.stringify({ payload })
    });
  }

  static async registerPushToken(uid: string, token: string, platform?: 'ios' | 'android') {
    await fetch(`${SERVER_BASE_URL}/api/status/register-token`, {
      method: 'POST',
      headers: toJsonHeaders,
      body: JSON.stringify({ uid, token, platform })
    });
  }

  static async fetchLatestStatuses(uids: string[]): Promise<(StatusRecord | null)[]> {
    if (!uids.length) return [];
    const query = encodeURIComponent(uids.join(','));
    const res = await fetch(`${SERVER_BASE_URL}/api/status?uids=${query}`);
    if (!res.ok) throw new Error('Failed to fetch status');
    return res.json();
  }

  static async fetchHistory(uid: string, limit = 10): Promise<StatusRecord[]> {
    const res = await fetch(`${SERVER_BASE_URL}/api/history/${uid}?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
  }

  static async listFamily(ownerUid: string): Promise<FamilyLink[]> {
    const res = await fetch(`${SERVER_BASE_URL}/api/family?ownerUid=${encodeURIComponent(ownerUid)}`);
    if (!res.ok) throw new Error('Failed to list family');
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => ({
      uid: item.contact_uid ?? item.contactUid ?? item.uid,
      alias: item.alias ?? undefined,
      role: item.role ?? undefined,
      verifiedAt: item.verified_at ?? item.verifiedAt ?? null
    }));
  }

  static async inviteFamily(ownerUid: string, contactUid: string, alias?: string, role?: string) {
    const res = await fetch(`${SERVER_BASE_URL}/api/family/invite`, {
      method: 'POST',
      headers: toJsonHeaders,
      body: JSON.stringify({ ownerUid, contactUid, alias, role })
    });
    if (!res.ok) throw new Error('Failed to invite family');
    return res.json() as Promise<{ ok: boolean; token: string }>;
  }

  static async acceptFamily(token: string, contactUid: string) {
    const res = await fetch(`${SERVER_BASE_URL}/api/family/accept`, {
      method: 'POST',
      headers: toJsonHeaders,
      body: JSON.stringify({ token, contactUid })
    });
    if (!res.ok) throw new Error('Failed to accept family');
    return res.json();
  }

  static async deleteFamily(ownerUid: string, contactUid: string) {
    const res = await fetch(
      `${SERVER_BASE_URL}/api/family/${encodeURIComponent(contactUid)}?ownerUid=${encodeURIComponent(ownerUid)}`,
      { method: 'DELETE', headers: toJsonHeaders }
    );
    if (!res.ok) throw new Error('Failed to delete family link');
    return res.json();
  }
}
