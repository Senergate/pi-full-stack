import { reactive } from 'vue';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://10.20.0.200:4000';
const RPC_TIMEOUT_MS = 3000;

const App = {
  _: reactive({
    connected: false,
    servicesReady: false,
    lastError: '',
    socketUrl: SOCKET_URL,
  }),

  io: null,

  clone: obj => {
    const clone = JSON.parse(JSON.stringify(obj));
    if (typeof clone === 'object' && clone && Object.hasOwn(clone, 'id')) clone.id = crypto.randomUUID();
    return clone;
  },

  wait: time => new Promise(resolve => setTimeout(resolve, time)),

  ensureConnected: () => {
    if (App.io) {
      if (!App.io.connected) App.io.connect();
      return App.io;
    }

    App._.lastError = '';
    const socket = io(SOCKET_URL, {
      autoConnect: true,
      maxHttpBufferSize: 20 * 1024 * 1024,
      reconnection: true,
      reconnectionDelayMax: 2500,
    });

    socket.a_emit = (name, params = []) =>
      new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          reject(new Error(`RPC timeout: ${name}`));
        }, RPC_TIMEOUT_MS);

        socket.emit(name, params, response => {
          window.clearTimeout(timer);

          if (response && response.ok === false) {
            reject(new Error(response.error?.message ?? response.error ?? `RPC failed: ${name}`));
            return;
          }

          resolve(response && response.ok === true ? response.data : response);
        });
      });

    socket.on('connect', async () => {
      App._.connected = true;
      App._.servicesReady = false;
      App._.lastError = '';

      try {
        const services = await socket.a_emit('getServices');

        for (const name in services) {
          const service = {
            listeners: {},
            on: (event, listener) => {
              if (!service.listeners[event]) service.listeners[event] = [];
              service.listeners[event].push(listener);
            },
            off: (event, listener) => {
              if (!service.listeners[event]) return;
              const index = service.listeners[event].indexOf(listener);
              if (index !== -1) service.listeners[event].splice(index, 1);
            },
            trigger: (event, data) => {
              service.listeners[event]?.forEach(listener => listener(...data));
            },
          };

          for (const func of services[name]) {
            service[func] = async (...args) => await socket.a_emit(`${name}.${func}`, args);
          }

          socket.off(name);
          socket.on(name, (...args) => App[name]?.trigger(args[0], args.slice(1)));
          App[name] = service;
        }

        App._.servicesReady = true;
      } catch (err) {
        App._.lastError = err instanceof Error ? err.message : String(err);
        App._.servicesReady = false;
      }
    });

    socket.on('disconnect', () => {
      App._.connected = false;
      App._.servicesReady = false;
    });

    socket.on('connect_error', err => {
      App._.lastError = err?.message ?? String(err);
      App._.connected = false;
      App._.servicesReady = false;
    });

    App.io = socket;
    return socket;
  },
};

export default App;
