export type DisasterStatus = 'CRITICAL' | 'SAFE' | 'RESCUED' | 'HOSPITAL' | 'UNKNOWN';

export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
};

export type MedicalInfo = {
  bloodType: string;
  conditions: string[];
};

export type UserProfile = {
  id: string;
  name: string;
  phone?: string;
  medicalInfo: MedicalInfo;
};

export type EncryptedPayload = string;

export type StatusRecord = {
  uid: string;
  ts: number;
  status: DisasterStatus;
  loc: {
    lat: number;
    lng: number;
    acc: number | null;
  };
  note?: string;
};

export type FamilyLink = {
  uid: string;
  alias?: string;
  role?: string;
  verifiedAt?: string | null;
};
