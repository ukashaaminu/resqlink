import AsyncStorage from '@react-native-async-storage/async-storage';
import { FamilyLink } from '../types';

const KEY = 'resq-link-family';

export const FamilyStorage = {
  async load(): Promise<FamilyLink[]> {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as FamilyLink[];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  },

  async save(list: FamilyLink[]) {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  }
};
