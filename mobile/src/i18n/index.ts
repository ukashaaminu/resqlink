import { NativeModules, Platform } from 'react-native';

export type Locale = 'en' | 'zh-Hant';

const en = {
  'status.ready': 'Ready - hold to send SOS',
  'status.arming': 'Hold for 3s to confirm',
  'status.preparing': 'Encrypting payload...',
  'status.sending': 'Sending via Internet',
  'status.broadcasting': 'Searching for relays...',
  'status.relaying': 'Relaying via mesh...',
  'status.sent_internet': 'Help requested - Internet',
  'status.safe_sent': 'Safe status sent',
  'status.marking_safe': 'Notifying contacts...',
  'status.error': 'Something went wrong - retry',
  'status.family_check': 'Family status - coming soon',
  'status.relayed_device': 'Relayed via device {{id}}',
  'status.option.critical': 'SOS',
  'status.option.safe': 'Safe',
  'status.option.rescued': 'Rescued',
  'status.option.hospital': 'Hospital',
  'status.option.unknown': 'Unknown',

  'cta.safe_sent': 'SAFE SENT',
  'cta.help_requested': 'HELP REQUESTED',
  'cta.sending': 'SENDING...',
  'cta.keep_holding': 'KEEP HOLDING',
  'cta.retry': 'RETRY',
  'cta.hold': 'HOLD FOR SOS',
  'cta.hold_status': 'Hold: {{status}}',

  'hint.hold_steady': 'Hold steady to avoid false trigger',
  'hint.mesh_delivered': 'Signal delivered via mesh',
  'hint.keep_holding': 'Keep holding...',
  'hint.long_press': 'Long press for 3 seconds',

  'network.online': 'ONLINE - Internet connected',
  'network.mesh': 'MESH MODE{{peers}}',
  'network.checking': 'Checking network...',
  'network.mesh_peers': ' - {{count}} peers',

  'ui.battery_saver': 'Battery Saver',
  'ui.status': 'Status',
  'ui.note_label': 'Other note',
  'ui.note_placeholder': 'Optional note (max 240 chars)',
  'ui.signal_route': 'Signal Route',
  'ui.route_direct': 'Direct internet path',
  'ui.route_mesh': 'Relaying through nearby devices until cloud is reached',
  'ui.family_check': 'Family Check',
  'ui.family_check_sub': "View loved ones' last update",
  'ui.safe': "I'm Safe",
  'ui.safe_sub': 'Send calm status update',
  'ui.locale_toggle_en': 'EN',
  'ui.locale_toggle_zh': '繁中',
  'ui.loading': 'Loading...',
  'ui.payload_ready': 'Payload ready ({{bytes}} bytes)',
  'ui.payload_empty': 'Payload not prepared yet',

  'mesh.you': 'You',
  'mesh.relay': 'Relay',
  'mesh.cloud': 'Cloud',
  'mesh.radar.scanning': 'Broadcasting SOS...',
  'mesh.radar.connected': 'Relaying via mesh...',
  'mesh.radar.sent': 'Help requested!',
  'mesh.log.encrypt': '> Encrypting payload... [OK]',
  'mesh.log.peer': '> Peer "{{name}}" found ({{rssi}} dBm)',
  'mesh.log.handshake': '> Handshake established...',
  'mesh.log.uploaded': '> Signal uploaded to server!',
  'mesh.route_hint': 'Awaiting hops...',

  'family.title': 'Family Status',
  'family.updated': 'Updated {{time}}',
  'family.status.safe': 'SAFE',
  'family.status.sos': 'SOS',
  'family.status.unknown': 'UNKNOWN',
  'family.location': 'Location: {{location}}',
  'family.location_unknown': 'Unknown',
  'family.no_update': 'No updates yet',
  'family.back': 'Back',
  'family.manage_title': 'Manage family & trusted contacts',
  'family.input_placeholder': 'Enter UIDs separated by comma',
  'family.alias_placeholder': 'Alias (optional, shown in list)',
  'family.new_id_placeholder': 'Add new UID',
  'family.add': 'Add',
  'family.remove': 'Remove',
  'family.refresh': 'Refresh',
  'family.refresh_sub': 'Pull latest from server',
  'family.empty': 'No family IDs added'
} as const;

export type TranslationKey = keyof typeof en;

const zhHant: Record<TranslationKey, string> = {
  'status.ready': '準備就緒 - 長按發出 SOS',
  'status.arming': '長按 3 秒確認',
  'status.preparing': '加密資料中...',
  'status.sending': '經網路送出',
  'status.broadcasting': '尋找中繼裝置...',
  'status.relaying': '網狀中繼傳送中...',
  'status.sent_internet': '已求助 - 經網路',
  'status.safe_sent': '平安狀態已送出',
  'status.marking_safe': '通知聯絡人中...',
  'status.error': '發生錯誤，請重試',
  'status.family_check': '親友狀態 - 即將推出',
  'status.relayed_device': '已由裝置 {{id}} 中繼',
  'status.option.critical': 'SOS',
  'status.option.safe': '平安',
  'status.option.rescued': '已獲救',
  'status.option.hospital': '送醫中',
  'status.option.unknown': '未知',

  'cta.safe_sent': '已送出',
  'cta.help_requested': '已求助',
  'cta.sending': '傳送中...',
  'cta.keep_holding': '請持續按住',
  'cta.retry': '重試',
  'cta.hold': '長按發出 SOS',
  'cta.hold_status': '長按：{{status}}',

  'hint.hold_steady': '請保持按住避免誤觸',
  'hint.mesh_delivered': '訊號已透過網狀傳送',
  'hint.keep_holding': '持續按住...',
  'hint.long_press': '長按 3 秒',

  'network.online': '在線 - 已連線',
  'network.mesh': '中繼模式{{peers}}',
  'network.checking': '檢查網路中...',
  'network.mesh_peers': ' - {{count}} 節點',

  'ui.battery_saver': '省電模式',
  'ui.status': '狀態',
  'ui.note_label': '其他備註',
  'ui.note_placeholder': '可選填備註（最多 240 字）',
  'ui.signal_route': '訊號路徑',
  'ui.route_direct': '直接上網',
  'ui.route_mesh': '透過附近裝置中繼至雲端',
  'ui.family_check': '親友查詢',
  'ui.family_check_sub': '查看親友最近狀態',
  'ui.safe': '我很安全',
  'ui.safe_sub': '送出平安更新',
  'ui.locale_toggle_en': 'EN',
  'ui.locale_toggle_zh': '繁中',
  'ui.loading': '載入中...',
  'ui.payload_ready': '資料已準備好 ({{bytes}} 位元組)',
  'ui.payload_empty': '尚未準備資料',

  'mesh.you': '你',
  'mesh.relay': '中繼',
  'mesh.cloud': '雲端',
  'mesh.radar.scanning': '廣播 SOS 中...',
  'mesh.radar.connected': '網狀中繼中...',
  'mesh.radar.sent': '已發出求助！',
  'mesh.log.encrypt': '> 加密資料完成',
  'mesh.log.peer': '> 發現節點 \"{{name}}\" ({{rssi}} dBm)',
  'mesh.log.handshake': '> 已建立握手...',
  'mesh.log.uploaded': '> 訊號已上傳伺服器',
  'mesh.route_hint': '等待路徑建立...',

  'family.title': '親友狀態',
  'family.updated': '更新於 {{time}}',
  'family.status.safe': '平安',
  'family.status.sos': '求助',
  'family.status.unknown': '未知',
  'family.location': '位置：{{location}}',
  'family.location_unknown': '未知',
  'family.no_update': '尚無更新',
  'family.back': '返回',
  'family.manage_title': '管理親友與可信任聯絡人',
  'family.input_placeholder': '輸入多個 UID，以逗號分隔',
  'family.alias_placeholder': '暱稱（可選，列表顯示）',
  'family.new_id_placeholder': '新增 UID',
  'family.add': '新增',
  'family.remove': '移除',
  'family.refresh': '刷新',
  'family.refresh_sub': '從伺服器拉取最新',
  'family.empty': '尚未新增家人 ID'
};

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en,
  'zh-Hant': zhHant
};

export const t = (locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string => {
  const table = translations[locale] || translations.en;
  const template = table[key] || translations.en[key] || key;

  if (!vars) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, k) => {
    if (vars[k] === undefined || vars[k] === null) return match;
    return String(vars[k]);
  });
};

export const getDeviceLocale = (): Locale => {
  const locale =
    Platform.OS === 'ios'
      ? NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
      : NativeModules.I18nManager?.localeIdentifier;

  if (locale && locale.startsWith('zh')) return 'zh-Hant';
  return 'en';
};

export const availableLocales: Locale[] = ['en', 'zh-Hant'];
