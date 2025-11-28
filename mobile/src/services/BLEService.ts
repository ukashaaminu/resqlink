import { Buffer } from 'buffer';
import { BleManager, Device } from 'react-native-ble-plx';
// react-native-peripheral has no TS types by default; require to avoid type errors.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Peripheral: any = require('react-native-peripheral');
import { BLE_DATA_CHAR_UUID, BLE_SERVICE_UUID } from '../config';
import { EncryptedPayload } from '../types';
import { Packet, PacketManager } from '../utils/PacketManager';
import { log } from '../utils/logger';
import { APIService } from './APIService';
import { MeshRouter } from './MeshRouter';

const manager = new BleManager();
let preparedChunks: string[] = [];
let advertising = false;
let advKeepAlive: ReturnType<typeof setInterval> | null = null;
const relayBuffers: Record<string, Packet[]> = {};
const seenPayloads: Map<string, number> = new Map(); // payloadId -> timestamp
type OutgoingJob = { payload: EncryptedPayload; ttl: number; hops: string[]; attempts: number; nextAt: number };
let outgoingQueue: OutgoingJob[] = [];
let queueTicking = false;
const QUEUE_INTERVAL_MS = 600;
const MAX_ATTEMPTS = 2;

type GatewayHandler = (device: Device) => Promise<void>;
type RelayCompleteHandler = (payload: EncryptedPayload, device: Device) => Promise<void>;

export class BLEService {
  static async broadcastSOS(payload: EncryptedPayload) {
    preparedChunks = PacketManager.chunkData(payload);
    await BLEService.ensurePeripheral();

    await Peripheral.startAdvertising({
      name: 'ResQ-SOS',
      serviceUuids: [BLE_SERVICE_UUID]
    });

    advertising = true;
    startAdvKeepAlive();
    log('ble_broadcast', `advertising with ${preparedChunks.length} chunks`);
  }

  static async scanForGateway(onGateway: GatewayHandler) {
    return new Promise<void>(resolve => {
      manager.startDeviceScan([BLE_SERVICE_UUID], null, async (error, device) => {
        if (error) {
          log('ble_scan_error', error);
          manager.stopDeviceScan();
          resolve();
          return;
        }

        if (device) {
          manager.stopDeviceScan();
          await onGateway(device);
          resolve();
        }
      });
    });
  }

  static async transferDataTo(device: Device, payload: EncryptedPayload) {
    await device.connect();
    await device.discoverAllServicesAndCharacteristics();
    const services = await device.services();
    const targetService = services.find(s => s.uuid.toLowerCase() === BLE_SERVICE_UUID.toLowerCase());
    const characteristics = targetService ? await targetService.characteristics() : [];
    const dataChar = characteristics.find(c => c.uuid.toLowerCase() === BLE_DATA_CHAR_UUID.toLowerCase());

    if (dataChar) {
      const chunks = PacketManager.chunkData(payload);

      for (const chunk of chunks) {
        const base64Chunk = Buffer.from(chunk, 'utf8').toString('base64');
        await device.writeCharacteristicWithResponseForService(
          BLE_SERVICE_UUID,
          BLE_DATA_CHAR_UUID,
          base64Chunk
        );
        // small pacing delay to avoid buffer overflow on receivers
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      log('ble_transfer', `sent ${chunks.length} chunks to ${device.id}`);
    } else {
      log('ble_transfer_error', 'Data characteristic not found');
    }

    await device.cancelConnection();
  }

  /**
   * Relay mode: scan, receive chunks, and upload to server once reassembled.
   */
  static async scanReceiveAndUpload() {
    await BLEService.scanAndReceive(async (payload: EncryptedPayload, device: Device) => {
      try {
        const { payload: inner, ttl, hops } = MeshRouter.unwrap(payload);
        if (isDuplicate(inner)) {
          log('ble_relay_skip_duplicate', device.id);
          return;
        }
        markSeen(inner);

        const hasInternet = await APIService.hasInternet();

        if (hasInternet) {
          await APIService.sendSOS(inner);
          log('ble_relay_upload', `uploaded payload from ${device.id}`);
          return;
        }

        if (ttl > 0) {
          const updatedHops = [...hops, device.id];
          enqueueRebroadcast(inner, ttl - 1, updatedHops);
          processQueue();
          log('ble_relay_rebroadcast', `queued rebroadcast ttl=${ttl - 1} via ${device.id}`);
        } else {
          log('ble_relay_drop', `ttl expired for payload from ${device.id}`);
        }
      } catch (error) {
        log('ble_relay_upload_error', error);
      }
    });
  }

  /**
   * Relay mode: scan, connect, subscribe to characteristic, reassemble chunks, then return payload.
   */
  static async scanAndReceive(onComplete: RelayCompleteHandler) {
    relayBuffersClear();
    return new Promise<void>(resolve => {
      manager.startDeviceScan([BLE_SERVICE_UUID], null, async (error, device) => {
        if (error) {
          log('ble_scan_error', error);
          manager.stopDeviceScan();
          resolve();
          return;
        }

        if (device) {
          manager.stopDeviceScan();
          try {
            const connected = await device.connect();
            await connected.discoverAllServicesAndCharacteristics();
            connected.monitorCharacteristicForService(
              BLE_SERVICE_UUID,
              BLE_DATA_CHAR_UUID,
              async (err, characteristic) => {
                if (err) {
                  log('ble_monitor_error', err);
                  return;
                }

                if (!characteristic?.value) return;
                const payload = processIncomingChunk(device, characteristic.value);
                if (payload) {
                  await onComplete(payload, device);
                  await device.cancelConnection();
                  resolve();
                }
              }
            );
          } catch (connErr) {
            log('ble_relay_error', connErr);
            resolve();
          }
        }
      });
    });
  }

  /**
   * Push prepared chunks to subscribed centrals (relay devices).
   * Should be triggered after a subscribe/write handshake from the central.
   */
  static async notifyPreparedChunks() {
    if (!advertising || preparedChunks.length === 0) return;

    for (const chunk of preparedChunks) {
      const base64Chunk = Buffer.from(chunk, 'utf8').toString('base64');
      await Peripheral.sendNotificationToDevices(BLE_SERVICE_UUID, BLE_DATA_CHAR_UUID, base64Chunk);
      await new Promise(resolve => setTimeout(resolve, 40));
    }

    log('ble_notify', `notified ${preparedChunks.length} chunks`);
  }

  static async stopBroadcast() {
    if (!advertising) return;
    try {
      await Peripheral.stopAdvertising();
    } catch (error) {
      log('ble_stop_adv_error', error);
    }
    advertising = false;
    stopAdvKeepAlive();
  }

  private static async ensurePeripheral() {
    if (advertising) return;
    // Permissions: 16 | 32 => Read | Notify ; Properties: 8 => Write/Notify depending on platform
    await Peripheral.addService(BLE_SERVICE_UUID, true);
    await Peripheral.addCharacteristicToService(BLE_SERVICE_UUID, BLE_DATA_CHAR_UUID, 16 | 32, 8, null);
  }
}

const relayBuffersClear = () => {
  Object.keys(relayBuffers).forEach(k => delete relayBuffers[k]);
};

const processIncomingChunk = (device: Device, base64Value: string): EncryptedPayload | null => {
  try {
    const jsonString = Buffer.from(base64Value, 'base64').toString('utf-8');
    const packet = JSON.parse(jsonString) as Packet;
    const key = device.id;
    if (!relayBuffers[key]) {
      relayBuffers[key] = [];
    }
    relayBuffers[key].push(packet);

    const total = packet.t;
    if (relayBuffers[key].length === total) {
      const assembled = PacketManager.reassembleData(relayBuffers[key]);
      relayBuffers[key] = [];
      return assembled;
    }
  } catch (err) {
    log('ble_relay_chunk_error', err);
  }

  return null;
};

const payloadId = (payload: EncryptedPayload): string => {
  return payload.slice(0, 32);
};

const isDuplicate = (payload: EncryptedPayload): boolean => {
  const id = payloadId(payload);
  const now = Date.now();
  const seenAt = seenPayloads.get(id);
  // 2 minute window dedupe
  return seenAt !== undefined && now - seenAt < 120000;
};

const markSeen = (payload: EncryptedPayload) => {
  seenPayloads.set(payloadId(payload), Date.now());
  // trim old entries
  const cutoff = Date.now() - 300000;
  for (const [key, ts] of seenPayloads.entries()) {
    if (ts < cutoff) seenPayloads.delete(key);
  }
};

const enqueueRebroadcast = (payload: EncryptedPayload, ttl: number, hops: string[]) => {
  outgoingQueue.push({ payload, ttl, hops, attempts: 0, nextAt: Date.now() });
};

const processQueue = async () => {
  if (queueTicking) return;
  queueTicking = true;

  while (outgoingQueue.length) {
    const now = Date.now();
    const job = outgoingQueue[0];
    if (job.nextAt > now) {
      await delay(job.nextAt - now);
    }

    try {
      const wrapped = MeshRouter.wrap(job.payload, job.ttl, job.hops);
      await BLEService.broadcastSOS(wrapped);
      await BLEService.notifyPreparedChunks();
      log('ble_queue_send', `sent queued payload ttl=${job.ttl}`);
      outgoingQueue.shift();
      await delay(QUEUE_INTERVAL_MS);
    } catch (err) {
      job.attempts += 1;
      if (job.attempts >= MAX_ATTEMPTS) {
        log('ble_queue_drop', `drop after retries ttl=${job.ttl}`);
        outgoingQueue.shift();
      } else {
        job.nextAt = Date.now() + QUEUE_INTERVAL_MS * 2;
      }
    }
  }

  queueTicking = false;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const startAdvKeepAlive = () => {
  if (advKeepAlive) return;
  // Re-issue advertising periodically to mitigate background drops.
  advKeepAlive = setInterval(async () => {
    if (!advertising) return;
    try {
      await Peripheral.startAdvertising({
        name: 'ResQ-SOS',
        serviceUuids: [BLE_SERVICE_UUID]
      });
    } catch (error) {
      log('ble_adv_keepalive_error', error);
    }
  }, 25000);
};

const stopAdvKeepAlive = () => {
  if (advKeepAlive) {
    clearInterval(advKeepAlive);
    advKeepAlive = null;
  }
};
