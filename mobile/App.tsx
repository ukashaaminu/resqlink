import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  AppState,
  PermissionsAndroid,
  Platform,
  View,
  Vibration
} from 'react-native';
import { LanguageProvider, useLanguage } from './src/i18n/LanguageProvider';
import { TranslationKey } from './src/i18n';
import { APIService } from './src/services/APIService';
import { BLEService } from './src/services/BLEService';
import { CryptoService } from './src/services/CryptoService';
import { FamilyStorage } from './src/services/FamilyStorage';
import { LocationService } from './src/services/LocationService';
import { MeshRouter } from './src/services/MeshRouter';
import { ProfileStorage } from './src/services/ProfileStorage';
import { PushService } from './src/services/PushService';
import { DisasterStatus, FamilyLink, StatusRecord, UserProfile } from './src/types';
import { log } from './src/utils/logger';
import { Device } from 'react-native-ble-plx';

const initialProfile: UserProfile = {
  id: 'demo-user',
  name: 'Anonymous Responder',
  phone: '',
  medicalInfo: { bloodType: 'Unknown', conditions: [] }
};

const palette = {
  red: '#FF3B30',
  green: '#34C759',
  blue: '#007AFF',
  black: '#000000',
  gray: '#3A3A3C',
  text: '#E5E7EB',
  card: '#0B0D11'
};

type Status =
  | 'idle'
  | 'arming'
  | 'preparing'
  | 'sending'
  | 'broadcasting'
  | 'relaying'
  | 'sent:internet'
  | 'safe-sent'
  | 'marking-safe'
  | 'error'
  | 'family-check'
  | `relayed:${string}`;

type Screen = 'home' | 'mesh' | 'family';

const statusKeyMap: Record<Exclude<Status, `relayed:${string}`>, TranslationKey> = {
  idle: 'status.ready',
  arming: 'status.arming',
  preparing: 'status.preparing',
  sending: 'status.sending',
  broadcasting: 'status.broadcasting',
  relaying: 'status.relaying',
  'sent:internet': 'status.sent_internet',
  'safe-sent': 'status.safe_sent',
  'marking-safe': 'status.marking_safe',
  error: 'status.error',
  'family-check': 'status.family_check'
};

type FamilyStatus = 'SAFE' | 'SOS' | 'UNKNOWN';
type MeshLogEntry = { key: TranslationKey; text: string };

const AppContent = () => {
  const { t, locale, setLocale } = useLanguage();
  const [status, setStatus] = useState<Status>('idle');
  const [lastPayload, setLastPayload] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [networkMode, setNetworkMode] = useState<'online' | 'mesh' | 'unknown'>('unknown');
  const [peerCount, setPeerCount] = useState<number>(0);
  const [meshPath, setMeshPath] = useState<string[]>(['you', 'cloud']);
  const [isHolding, setIsHolding] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [meshStep, setMeshStep] = useState<0 | 1 | 2>(0);
  const [meshLogs, setMeshLogs] = useState<MeshLogEntry[]>([]);
  const [payloadBytes, setPayloadBytes] = useState<number>(0);
  const [lastDeviceName, setLastDeviceName] = useState<string>('relay');
  const [familyIdsInput, setFamilyIdsInput] = useState<string>('');
  const [familyStatuses, setFamilyStatuses] = useState<Record<string, StatusRecord | null>>({});
  const [familyLoading, setFamilyLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<DisasterStatus>('CRITICAL');
  const [note, setNote] = useState<string>('');
  const [familyLinks, setFamilyLinks] = useState<FamilyLink[]>([]);
  const [newFamilyId, setNewFamilyId] = useState('');
  const [newFamilyAlias, setNewFamilyAlias] = useState('');

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const radarSpin = useRef(new Animated.Value(0)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const radarLoop = useRef<Animated.CompositeAnimation | null>(null);
  const appState = useRef(AppState.currentState);
  const relayLooping = useRef(false);

  useEffect(() => {
    const bootstrapProfile = async () => {
      try {
        const stored = await ProfileStorage.load();
        if (stored) {
          setProfile(stored);
          return;
        }
        await ProfileStorage.save(initialProfile);
        setProfile(initialProfile);
      } catch (error) {
        log('profile_load_error', error);
        setProfile(initialProfile);
      }
    };
    bootstrapProfile();
  }, []);

  useEffect(() => {
    const loadFamily = async () => {
      const stored = await FamilyStorage.load();
      setFamilyLinks(stored);
      if (stored.length) {
        setFamilyIdsInput(stored.map(l => l.uid).join(','));
      }
    };
    loadFamily();
  }, []);

  useEffect(() => {
    const checkNet = async () => {
      const online = await APIService.hasInternet();
      setNetworkMode(online ? 'online' : 'mesh');
    };
    checkNet();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const ensurePermissions = async () => {
      if (Platform.OS !== 'android') return;
      const perms = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
      ].filter(Boolean) as string[];
      try {
        await PermissionsAndroid.requestMultiple(perms);
      } catch (error) {
        log('ble_permission_error', error);
      }
    };
    ensurePermissions();
  }, []);

  useEffect(() => {
    if (relayLooping.current) return;
    relayLooping.current = true;
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        if (appState.current !== 'active') {
          await delay(1500);
          continue;
        }
        try {
          await BLEService.scanReceiveAndUpload();
        } catch (error) {
          log('relay_loop_error', error);
        }
        await delay(800);
      }
    };
    loop();
    return () => {
      cancelled = true;
      relayLooping.current = false;
    };
  }, []);

  useEffect(() => {
    const registerPush = async () => {
      if (!profile) return;
      try {
        await PushService.register(profile.id);
      } catch (error) {
        log('push_register_error', error);
      }
    };
    registerPush();
  }, [profile]);

  useEffect(() => {
    const fetchFamily = async () => {
      if (!profile) return;
      try {
        const remote = await APIService.listFamily(profile.id);
        setFamilyLinks(remote);
        if (remote.length) {
          setFamilyIdsInput(remote.map(r => r.uid).filter(Boolean).join(','));
        }
        await FamilyStorage.save(remote);
      } catch (error) {
        log('family_fetch_error', error);
      }
    };
    fetchFamily();
  }, [profile]);

  useEffect(() => {
    if (profile && !familyIdsInput) {
      setFamilyIdsInput(profile.id);
    }
  }, [profile, familyIdsInput]);

  useEffect(() => {
    const shouldPulse = ['idle', 'arming', 'broadcasting', 'relaying'].includes(status);
    if (shouldPulse) {
      pulseLoop.current?.stop();
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true })
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulse.setValue(1);
    }
  }, [status, pulse]);

  useEffect(() => {
    if (screen === 'mesh') {
      radarLoop.current?.stop();
      radarSpin.setValue(0);
      radarLoop.current = Animated.loop(
        Animated.timing(radarSpin, {
          toValue: 1,
          duration: 3200,
          useNativeDriver: true
        })
      );
      radarLoop.current.start();
    } else {
      radarLoop.current?.stop();
      radarSpin.setValue(0);
    }
  }, [screen, radarSpin]);

  const appendMeshLog = (key: TranslationKey, vars?: Record<string, string | number>) => {
    const text = t(key, vars);
    setMeshLogs((prev: MeshLogEntry[]) => [{ key, text }, ...prev].slice(0, 6));
  };

  const handleSOS = async (statusOverride?: DisasterStatus) => {
    if (!profile) {
      setStatus('error');
      return;
    }
    setStatus('preparing');
    setMeshPath(['you', 'cloud']);
    setMeshLogs([]);
    setMeshStep(0);
    setScreen('home');
    try {
      Vibration.vibrate(50);
      const location = await LocationService.getCurrentLocation();
      const chosenStatus = statusOverride ?? selectedStatus ?? 'CRITICAL';
      const payload = await CryptoService.buildEncryptedPayload({
        userProfile: profile,
        location,
        status: chosenStatus,
        note: note.trim() || undefined
      });
      setLastPayload(payload);
      setPayloadBytes(payload.length);
      appendMeshLog('mesh.log.encrypt');

      const isOnline = await APIService.hasInternet();
      setNetworkMode(isOnline ? 'online' : 'mesh');

      if (isOnline) {
        setStatus('sending');
        await APIService.sendSOS(payload);
        setStatus('sent:internet');
        return;
      }

      setStatus('broadcasting');
      setScreen('mesh');
      const wrappedPayload = MeshRouter.wrap(payload, 2, []);
      await BLEService.broadcastSOS(wrappedPayload);
      // Push chunks to any connected relay subscribers.
      await BLEService.notifyPreparedChunks();
      setMeshPath(['you', 'relay', 'cloud']);
      appendMeshLog('mesh.route_hint');

      setStatus('relaying');
      await BLEService.scanForGateway(async (device: Device) => {
        setPeerCount(prev => Math.max(prev, 1));
        setMeshPath(['you', device.name || 'relay', 'cloud']);
        setLastDeviceName(device.name || 'relay');
        setMeshStep(1);
        appendMeshLog('mesh.log.peer', { name: device.name || 'relay', rssi: '-45' });
        appendMeshLog('mesh.log.handshake');
        await BLEService.transferDataTo(device, wrappedPayload);
        setMeshStep(2);
        appendMeshLog('mesh.log.uploaded');
        setStatus(`relayed:${device.id}`);
      });
    } catch (error) {
      log('sos_error', error);
      setStatus('error');
    }
  };

  const handleMarkSafe = async () => {
    await handleSOS('SAFE');
  };

  const handleFamilyCheck = () => {
    setStatus('family-check');
    setScreen('family');
  };

  const refreshFamilyStatuses = async () => {
    const ids = familyIdsInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!ids.length) return;
    setFamilyLoading(true);
    try {
      const results = await APIService.fetchLatestStatuses(ids);
      const map: Record<string, StatusRecord | null> = {};
      ids.forEach((id, idx) => {
        map[id] = results[idx] ?? null;
      });
      setFamilyStatuses(map);
    } catch (error) {
      log('family_status_error', error);
    } finally {
      setFamilyLoading(false);
    }
  };

  const addFamilyLink = async () => {
    if (!profile || !newFamilyId.trim()) return;
    try {
      const contactUid = newFamilyId.trim();
      const alias = newFamilyAlias.trim() || undefined;
      const invite = await APIService.inviteFamily(profile.id, contactUid, alias);
      if (invite?.token) {
        // Auto-accept to simplify UX; in real flow contact should accept.
        await APIService.acceptFamily(invite.token, contactUid);
      }
      const updated = [...familyLinks.filter(f => f.uid !== contactUid), { uid: contactUid, alias }];
      setFamilyLinks(updated);
      await FamilyStorage.save(updated);
      setFamilyIdsInput(updated.map(f => f.uid).join(','));
      setNewFamilyId('');
      setNewFamilyAlias('');
    } catch (error) {
      log('family_add_error', error);
    }
  };

  const removeFamilyLink = async (uid: string) => {
    if (!profile) return;
    try {
      await APIService.deleteFamily(profile.id, uid);
      const updated = familyLinks.filter(f => f.uid !== uid);
      setFamilyLinks(updated);
      await FamilyStorage.save(updated);
      setFamilyIdsInput(updated.map(f => f.uid).join(','));
    } catch (error) {
      log('family_remove_error', error);
    }
  };

  const startHold = () => {
    if (status !== 'idle' && status !== 'error') return;
    setIsHolding(true);
    setStatus('arming');
    Vibration.vibrate(30);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      handleSOS();
    }, 3000);
  };

  const cancelHold = () => {
    setIsHolding(false);
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      setStatus('idle');
    }
  };

  const statusText = (): string => {
    if (status.startsWith('relayed:')) {
      return t('status.relayed_device', { id: status.split(':')[1] });
    }

    if (status in statusKeyMap) {
      const key = statusKeyMap[status as keyof typeof statusKeyMap];
      return t(key);
    }

    return '';
  };

  const sosLabel = () => {
    if (status === 'safe-sent') return t('cta.safe_sent');
    if (status === 'sent:internet' || status.startsWith('relayed')) return t('cta.help_requested');
    if (['sending', 'broadcasting', 'relaying', 'preparing'].includes(status)) return t('cta.sending');
    if (status === 'arming') return t('cta.keep_holding');
    if (status === 'error') return t('cta.retry');
    return t('cta.hold_status', { status: statusLabel(selectedStatus) });
  };

  const sosHint = () => {
    if (status === 'arming') return t('hint.hold_steady');
    if (status.startsWith('relayed')) return t('hint.mesh_delivered');
    if (isHolding) return t('hint.keep_holding');
    return t('hint.long_press');
  };

  const meshPeersText = peerCount ? t('network.mesh_peers', { count: peerCount }) : '';

  const networkLabel =
    networkMode === 'online'
      ? t('network.online')
      : networkMode === 'mesh'
        ? t('network.mesh', { peers: meshPeersText })
        : t('network.checking');

  const renderMeshNodeLabel = (node: string) => {
    if (node === 'you') return t('mesh.you');
    if (node === 'relay') return t('mesh.relay');
    if (node === 'cloud') return t('mesh.cloud');
    return node;
  };

  const toggleLocale = () => {
    setLocale(locale === 'en' ? 'zh-Hant' : 'en');
  };

  const meshTitle =
    meshStep === 0 ? t('mesh.radar.scanning') : meshStep === 1 ? t('mesh.radar.connected') : t('mesh.radar.sent');

  const radarRotate = radarSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const payloadSummary = lastPayload
    ? t('ui.payload_ready', { bytes: payloadBytes })
    : t('ui.payload_empty');

  const statusOptions: DisasterStatus[] = ['CRITICAL', 'SAFE', 'RESCUED', 'HOSPITAL', 'UNKNOWN'];

  const statusLabel = (value: DisasterStatus) => {
    switch (value) {
      case 'CRITICAL':
        return t('status.option.critical');
      case 'SAFE':
        return t('status.option.safe');
      case 'RESCUED':
        return t('status.option.rescued');
      case 'HOSPITAL':
        return t('status.option.hospital');
      case 'UNKNOWN':
      default:
        return t('status.option.unknown');
    }
  };

  if (screen === 'family') {
    const idsList =
      familyLinks.length > 0
        ? familyLinks.map(f => f.uid)
        : familyIdsInput.split(',').map(s => s.trim()).filter(Boolean);
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable style={[styles.pill, styles.pillDark]} onPress={() => setScreen('home')}>
            <Text style={styles.pillText}>{t('family.back')}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('family.title')}</Text>
          <View style={[styles.pill, styles.pillDark]}>
            <Text style={styles.pillText}>{locale === 'en' ? t('ui.locale_toggle_en') : t('ui.locale_toggle_zh')}</Text>
          </View>
        </View>

        <View style={styles.familyControls}>
          <Text style={styles.sectionLabel}>{t('family.manage_title')}</Text>
          <TextInput
            placeholder={t('family.input_placeholder')}
            placeholderTextColor="#6B7280"
            style={styles.input}
            value={familyIdsInput}
            onChangeText={setFamilyIdsInput}
            autoCapitalize="none"
          />
          <TextInput
            placeholder={t('family.alias_placeholder')}
            placeholderTextColor="#6B7280"
            style={styles.input}
            value={newFamilyAlias}
            onChangeText={setNewFamilyAlias}
            autoCapitalize="none"
          />
          <View style={styles.addRow}>
            <TextInput
              placeholder={t('family.new_id_placeholder')}
              placeholderTextColor="#6B7280"
              style={[styles.input, { flex: 1 }]}
              value={newFamilyId}
              onChangeText={setNewFamilyId}
              autoCapitalize="none"
            />
            <Pressable style={[styles.smallBtn, styles.family]} onPress={addFamilyLink}>
              <Text style={styles.smallBtnText}>{t('family.add')}</Text>
            </Pressable>
          </View>
          <Pressable style={[styles.actionBtn, styles.family]} onPress={refreshFamilyStatuses} disabled={familyLoading}>
            <Text style={styles.actionTitle}>{familyLoading ? t('ui.loading') : t('family.refresh')}</Text>
            <Text style={styles.actionSubtitle}>{t('family.refresh_sub')}</Text>
          </Pressable>
        </View>

        <FlatList<string>
          data={idsList}
          keyExtractor={item => item}
          contentContainerStyle={styles.familyList}
          ListEmptyComponent={<Text style={styles.cardTime}>{t('family.empty')}</Text>}
          renderItem={({ item }: { item: string }) => {
            const record = familyStatuses[item];
            const status = record?.status ?? 'UNKNOWN';
            const location = record
              ? ${record.loc.lat.toFixed(4)}, 
              : t('family.location_unknown');
            const time = record ? timeAgo(record.ts) : t('family.no_update');
            const alias = familyLinks.find(f => f.uid === item)?.alias;
            return (
              <View style={styles.card}>
                <View style={styles.cardLeft}>
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>👥</Text>
                  </View>
                  <View>
                    <Text style={styles.cardName}>{alias || item}</Text>
                    <Text style={styles.cardTime}>{item}</Text>
                    <Text style={styles.cardTime}>{t('family.updated', { time })}</Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <View style={[styles.badge, { backgroundColor: badgeColor(status as FamilyStatus) }]}>
                    <Text style={styles.badgeText}>{familyStatusLabel(t, status as FamilyStatus)}</Text>
                  </View>
                  <Text style={styles.locationText}>{t('family.location', { location })}</Text>
                  <Pressable style={styles.removeBtn} onPress={() => removeFamilyLink(item)}>
                    <Text style={styles.removeBtnText}>{t('family.remove')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      </SafeAreaView>
    );
  }
  const shouldShowMeshPanel =
    screen === 'mesh' || status === 'broadcasting' || status === 'relaying' || status.startsWith('relayed');

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.pill, { backgroundColor: networkMode === 'online' ? palette.green : palette.blue }]}>
            <Text style={styles.pillText}>{networkLabel}</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable style={[styles.pill, styles.pillDark, styles.localeToggle]} onPress={toggleLocale}>
              <Text style={styles.pillText}>{locale === 'en' ? t('ui.locale_toggle_zh') : t('ui.locale_toggle_en')}</Text>
            </Pressable>
            <View style={[styles.pill, styles.pillDark]}>
              <Text style={styles.pillText}>{t('ui.battery_saver')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.rippleContainer}>
            <View style={[styles.rippleRing, { width: 320, height: 320, opacity: 0.1 }]} />
            <View style={[styles.rippleRing, { width: 280, height: 280, opacity: 0.2 }]} />
            <View style={[styles.rippleRing, { width: 240, height: 240, opacity: 0.25 }]} />
          </View>

          <Animated.View style={[styles.sosButton, { backgroundColor: sosColor(status), transform: [{ scale: pulse }] }]}>
            <Pressable
              onPressIn={startHold}
              onPressOut={cancelHold}
              disabled={
                ['sending', 'broadcasting', 'relaying', 'preparing', 'marking-safe'].includes(status) || !profile
              }
              style={styles.pressLayer}
            >
              <Text style={styles.sosLabel}>{sosLabel()}</Text>
              <Text style={styles.sosHint}>{sosHint()}</Text>
            </Pressable>
          </Animated.View>

          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>{t('ui.status')}</Text>
            <Text style={styles.statusText}>{statusText()}</Text>
            <Text style={styles.statusSub}>{payloadSummary}</Text>
          </View>
        </View>

        <View style={styles.statusSelector}>
          {statusOptions.map(option => (
            <Pressable
              key={option}
              style={[
                styles.statusChip,
                selectedStatus === option ? styles.statusChipActive : undefined
              ]}
              onPress={() => setSelectedStatus(option)}
            >
              <Text style={[styles.statusChipText, selectedStatus === option ? styles.statusChipTextActive : null]}>
                {statusLabel(option)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>{t('ui.note_label')}</Text>
          <TextInput
            placeholder={t('ui.note_placeholder')}
            placeholderTextColor="#6B7280"
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={240}
          />
          <Text style={styles.noteCounter}>{note.length}/240</Text>
        </View>

        <View style={styles.meshCard}>
          <Text style={styles.meshTitle}>{t('ui.signal_route')}</Text>
          <View style={styles.meshLine}>
            {meshPath.map((node: string, idx: number) => (
              <React.Fragment key={`${node}-${idx}`}>
                <Animated.View
                  style={[
                    styles.meshNode,
                    status.startsWith('relayed') || idx <= meshStep ? styles.meshNodeActive : undefined
                  ]}
                >
                  <Text style={styles.meshNodeText}>{renderMeshNodeLabel(node)}</Text>
                </Animated.View>
                {idx !== meshPath.length - 1 ? <View style={styles.meshConnector} /> : null}
              </React.Fragment>
            ))}
          </View>
          <Text style={styles.meshHint}>
            {networkMode === 'online' ? t('ui.route_direct') : t('ui.route_mesh')}
          </Text>
        </View>

        {shouldShowMeshPanel && (
          <View style={styles.radarPanel}>
            <Text style={styles.meshTitle}>{meshTitle}</Text>
            <View style={styles.radarContainer}>
              <View style={[styles.radarCircle, { width: 100 }]} />
              <View style={[styles.radarCircle, { width: 180 }]} />
              <View style={[styles.radarCircle, { width: 260 }]} />
              <Animated.View style={[styles.radarLine, { transform: [{ rotate: radarRotate }] }]} />
              <View style={styles.userNode}>
                <Text style={styles.radarIcon}>🆘</Text>
              </View>
              {meshStep >= 1 && (
                <View style={[styles.peerNode, { top: 40, right: 50 }]}>
                  <Text style={styles.radarIcon}>📱</Text>
                </View>
              )}
              {meshStep >= 1 && (
                <View style={[styles.peerNode, { bottom: 60, left: 40 }]}>
                  <Text style={styles.radarIcon}>💻</Text>
                </View>
              )}
            </View>
            <View style={styles.logContainer}>
              {meshLogs.length === 0 ? (
                <Text style={styles.logText}>{t('mesh.route_hint')}</Text>
              ) : (
                meshLogs.map((entry: MeshLogEntry, idx: number) => (
                  <Text
                    key={`${entry.key}-${idx}`}
                    style={[styles.logText, entry.key === 'mesh.log.uploaded' ? styles.logSuccess : null]}
                  >
                    {entry.text}
                  </Text>
                ))
              )}
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Pressable style={[styles.actionBtn, styles.family]} onPress={handleFamilyCheck}>
            <Text style={styles.actionTitle}>{t('ui.family_check')}</Text>
            <Text style={styles.actionSubtitle}>{t('ui.family_check_sub')}</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.safe]} onPress={handleMarkSafe}>
            <Text style={styles.actionTitle}>{t('ui.safe')}</Text>
            <Text style={styles.actionSubtitle}>{t('ui.safe_sub')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const badgeColor = (status: FamilyStatus) => {
  if (status === 'SAFE') return palette.green;
  if (status === 'SOS') return palette.red;
  return '#F59E0B';
};

const familyStatusLabel = (
  translate: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  status: FamilyStatus
) => {
  if (status === 'SAFE') return translate('family.status.safe');
  if (status === 'SOS') return translate('family.status.sos');
  return translate('family.status.unknown');
};

const timeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const sosColor = (status: Status) => {
  if (status === 'safe-sent' || status === 'sent:internet' || status.startsWith('relayed')) {
    return palette.green;
  }
  if (['sending', 'broadcasting', 'relaying', 'preparing'].includes(status)) return palette.blue;
  if (status === 'marking-safe') return palette.green;
  return palette.red;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.black
  },
  content: {
    padding: 20,
    gap: 18
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  headerTitle: {
    color: palette.text,
    fontWeight: '800',
    fontSize: 18
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20
  },
  pillDark: {
    backgroundColor: palette.gray
  },
  localeToggle: {
    minWidth: 60,
    alignItems: 'center'
  },
  pillText: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 13
  },
  hero: {
    alignItems: 'center',
    gap: 12
  },
  rippleContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center'
  },
  rippleRing: {
    position: 'absolute',
    borderRadius: 200,
    borderWidth: 1,
    borderColor: palette.red,
    backgroundColor: 'transparent'
  },
  sosButton: {
    width: 260,
    height: 260,
    borderRadius: 130,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  pressLayer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  sosLabel: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1
  },
  sosHint: {
    color: '#fff',
    opacity: 0.8,
    marginTop: 10,
    textAlign: 'center',
    fontSize: 13
  },
  statusCard: {
    backgroundColor: palette.card,
    borderColor: '#111827',
    borderWidth: 1,
    padding: 14,
    borderRadius: 14,
    width: '100%'
  },
  statusTitle: {
    color: palette.text,
    fontWeight: '700',
    marginBottom: 4
  },
  statusText: {
    color: '#A5F3FC',
    marginBottom: 4,
    fontWeight: '600'
  },
  statusSub: {
    color: '#CBD5E1',
    fontSize: 12
  },
  meshCard: {
    backgroundColor: palette.card,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#111827',
    gap: 10
  },
  meshTitle: {
    color: palette.text,
    fontWeight: '700'
  },
  meshLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center'
  },
  meshNode: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  meshNodeActive: {
    borderColor: palette.blue,
    backgroundColor: '#0f172a'
  },
  meshNodeText: {
    color: palette.text,
    fontWeight: '600'
  },
  meshConnector: {
    height: 2,
    width: 30,
    backgroundColor: palette.blue
  },
  meshHint: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center'
  },
  radarPanel: {
    backgroundColor: palette.card,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#111827',
    alignItems: 'center',
    gap: 10
  },
  radarContainer: {
    width: 260,
    height: 260,
    justifyContent: 'center',
    alignItems: 'center'
  },
  radarCircle: {
    position: 'absolute',
    aspectRatio: 1,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: '#3A3A3C'
  },
  radarLine: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRightWidth: 2,
    borderColor: palette.blue,
    borderRadius: 130,
    opacity: 0.5
  },
  userNode: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3A3A3C',
    justifyContent: 'center',
    alignItems: 'center'
  },
  peerNode: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.blue,
    justifyContent: 'center',
    alignItems: 'center'
  },
  radarIcon: {
    fontSize: 22
  },
  logContainer: {
    width: '100%',
    backgroundColor: '#111',
    padding: 12,
    borderRadius: 10,
    gap: 4
  },
  logText: {
    color: '#9CA3AF',
    fontFamily: 'Menlo',
    fontSize: 12
  },
  logSuccess: {
    color: palette.green,
    fontWeight: '700'
  },
  footer: {
    flexDirection: 'row',
    gap: 12
  },
  actionBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12
  },
  family: {
    backgroundColor: '#0A84FF'
  },
  safe: {
    backgroundColor: palette.green
  },
  actionTitle: {
    color: '#fff',
    fontWeight: '800',
    marginBottom: 4
  },
  actionSubtitle: {
    color: '#F8FAFC',
    opacity: 0.9,
    fontSize: 12
  },
  familyList: {
    padding: 16,
    gap: 12
  },
  familyControls: {
    paddingHorizontal: 16,
    gap: 10
  },
  sectionLabel: {
    color: palette.text,
    fontWeight: '800'
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  smallBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center'
  },
  smallBtnText: {
    color: '#fff',
    fontWeight: '700'
  },
  input: {
    backgroundColor: '#1F2937',
    color: palette.text,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151'
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  cardRight: {
    alignItems: 'flex-end'
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarText: {
    fontSize: 20
  },
  cardName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700'
  },
  cardTime: {
    color: '#94A3B8',
    fontSize: 12
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 4
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold'
  },
  locationText: {
    color: '#94A3B8',
    fontSize: 12
  },
  removeBtn: {
    marginTop: 6,
    paddingVertical: 6
  },
  removeBtnText: {
    color: '#FCA5A5',
    fontWeight: '700'
  },
  statusSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  statusChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0b0d11'
  },
  statusChipActive: {
    borderColor: palette.blue,
    backgroundColor: '#0f172a'
  },
  statusChipText: {
    color: palette.text,
    fontWeight: '600'
  },
  statusChipTextActive: {
    color: '#bfdbfe'
  },
  noteBox: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    padding: 12,
    gap: 6
  },
  noteLabel: {
    color: palette.text,
    fontWeight: '700'
  },
  noteInput: {
    minHeight: 60,
    color: palette.text,
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  noteCounter: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'right'
  }
});

