import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import CryptoJS from 'crypto-js';
import { UserProfile } from '../types';

const PROFILE_KEY = 'resq-link-profile';
const KEYCHAIN_SERVICE = 'resq-link-profile-key';

const generateKey = (): string => CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Base64);

const biometricOptions = (): Keychain.Options => ({
  service: KEYCHAIN_SERVICE,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
  authenticationPrompt: {
    title: 'Unlock profile',
    subtitle: 'Authenticate to access your profile'
  }
});

const getExistingKey = async (): Promise<string | null> => {
  try {
    const creds = await Keychain.getGenericPassword(biometricOptions());
    return creds?.password ?? null;
  } catch {
    return null;
  }
};

const getOrCreateKey = async (): Promise<string> => {
  const existing = await getExistingKey();
  if (existing) return existing;
  const fresh = generateKey();
  try {
    await Keychain.setGenericPassword('resq-link', fresh, biometricOptions());
  } catch {
    // Fallback to non-biometric storage if biometric is unavailable.
    await Keychain.setGenericPassword('resq-link', fresh, { service: KEYCHAIN_SERVICE });
  }
  return fresh;
};

const encrypt = (profile: UserProfile, key: string): string => {
  return CryptoJS.AES.encrypt(JSON.stringify(profile), key).toString();
};

const decrypt = (cipher: string, key: string): UserProfile | null => {
  const bytes = CryptoJS.AES.decrypt(cipher, key);
  const plaintext = bytes.toString(CryptoJS.enc.Utf8);
  if (!plaintext) return null;
  return JSON.parse(plaintext) as UserProfile;
};

export class ProfileStorage {
  static async save(profile: UserProfile) {
    const key = await getOrCreateKey();
    const cipher = encrypt(profile, key);
    await AsyncStorage.setItem(PROFILE_KEY, cipher);
  }

  static async load(): Promise<UserProfile | null> {
    const cipher = await AsyncStorage.getItem(PROFILE_KEY);
    if (!cipher) return null;
    const key = await getExistingKey();
    if (!key) {
      await AsyncStorage.removeItem(PROFILE_KEY);
      return null;
    }
    const profile = decrypt(cipher, key);
    if (!profile) {
      await AsyncStorage.removeItem(PROFILE_KEY);
      return null;
    }
    return profile;
  }

  static async clear() {
    await AsyncStorage.removeItem(PROFILE_KEY);
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  }
}
