import { reactive } from 'vue';

import { io } from 'socket.io-client';

const App = {
  _: reactive({
    connected: false,
    // Safe default for development: local simulation never sends actuator MQTT.
    mode: 'simulation',
  }),

  io: io('10.20.0.200:4000', { maxHttpBufferSize: 20 * 1024 * 1024 }),

  clone: obj => {
    const clone = JSON.parse(JSON.stringify(obj));
    if (typeof clone === 'object' && clone.hasOwnProperty('id')) clone.id = crypto.randomUUID();
    return clone;
  },

  wait: time => new Promise(resolve => setTimeout(resolve, time)),

  setMode: mode => {
    if (mode !== 'simulation' && mode !== 'real') return false;
    App._.mode = mode;
    return true;
  },
};

App.io.on('connect', async () => {
  // Init Services
  const services = await App.io.a_emit('getServices');
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
    for (let func of services[name]) service[func] = async (...args) => await App.io.a_emit(name + '.' + func, args);
    App.io.on(name, (...args) => App[name].trigger(args[0], args.slice(1)));
    App[name] = service;
  }

  App._.connected = true;
});
App.io.on('disconnect', () => (App._.connected = false));

App.io.a_emit = (name, params) => {
  return new Promise((res, rej) => {
    App.io.emit(name, params, res);
  });
};

export default App;
