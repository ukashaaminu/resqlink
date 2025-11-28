import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { APIService } from './APIService';

export class PushService {
  static async register(uid: string) {
    const hasPermission = await PushService.ensurePermission();
    if (!hasPermission) {
      return null;
    }

    const token = await messaging().getToken();
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await APIService.registerPushToken(uid, token, platform);
    return token;
  }

  private static async ensurePermission(): Promise<boolean> {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    return enabled;
  }
}
