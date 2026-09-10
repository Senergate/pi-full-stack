import mqtt from 'mqtt';
import config from './config.js';

const PI5_HEARTBEAT_TOPIC = 'senergate/sys/heartbeat/pi5';
const HEARTBEAT_PERIOD_MS = 1000;

const MqttService = {
  name: 'MqttService',
  connected: false,
  heartbeatTimer: null,
  lastHeartbeatAt: null,

  createMqttClient: () =>
    mqtt.connect(`mqtt://localhost:${config.mqtt_port}`, {
      clientId: `senergate-server-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 1000,
    }),

  status: () => ({
    connected: MqttService.connected,
    heartbeat_topic: PI5_HEARTBEAT_TOPIC,
    heartbeat_period_ms: HEARTBEAT_PERIOD_MS,
    last_heartbeat_at: MqttService.lastHeartbeatAt,
  }),

  _publishPi5Heartbeat: () => {
    if (!MqttService.connected || !MqttService.bus) return false;
    MqttService.bus.publish(
      PI5_HEARTBEAT_TOPIC,
      JSON.stringify({ source: 'pi5-node-backend', ts_pi: Date.now() / 1000 }),
      { qos: 0, retain: false }
    );
    MqttService.lastHeartbeatAt = Date.now();
    return true;
  },

  init: async () => {
    console.log('init mqtt service');
    MqttService.bus = MqttService.createMqttClient();

    if (!MqttService.heartbeatTimer) {
      MqttService.heartbeatTimer = setInterval(() => MqttService._publishPi5Heartbeat(), HEARTBEAT_PERIOD_MS);
      MqttService.heartbeatTimer.unref?.();
    }

    MqttService.bus.on('connect', () => {
      MqttService.connected = true;
      console.log('mqtt bus connected');
      MqttService._publishPi5Heartbeat();
    });

    MqttService.bus.on('offline', () => {
      MqttService.connected = false;
      console.warn('mqtt bus offline');
    });

    MqttService.bus.on('close', () => {
      MqttService.connected = false;
    });

    MqttService.bus.on('error', err => {
      MqttService.connected = false;
      console.error('mqtt bus error:', err.message);
    });
  },
};

export default MqttService;
