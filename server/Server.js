import path from 'path';
import http from 'http';
import express from 'express';
import config from './config.js';
import { Server as IOServer } from 'socket.io';

const Server = {
  services: new Map(),

  getServices: () =>
    Object.fromEntries(
      [...Server.services].map(([key, value]) => [
        key,
        Object.keys(value).filter(attr => typeof value[attr] === 'function' && attr !== 'init' && !attr.startsWith('_')),
      ])
    ),

  emitServiceEvent: (service, event, payload) => {
    if (!Server.io) return;
    Server.io.emit(service, event, payload);
  },

  init: async services => {
    if (!Server.server) throw new Error('Server.start() must be called before Server.init().');

    Server.io = new IOServer(Server.server, {
      cors: {
        origin: [`http://${config.pi_ip}:5173`, 'http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST'],
      },
      maxHttpBufferSize: 20 * 1024 * 1024,
    });

    // Register all services first, so init() can safely access dependencies.
    for (const service of services) {
      service.server = Server;
      Server.services.set(service.name, service);
    }

    for (const service of services) {
      await service.init?.(Server);
    }

    Server.io.on('connect', socket => {
      socket.on('getServices', (_, ack) => ack(Server.getServices()));
      const exposedServices = Server.getServices();

      for (const serviceName in exposedServices) {
        const service = Server.services.get(serviceName);
        for (const funcName of exposedServices[serviceName]) {
          socket.on(`${serviceName}.${funcName}`, async (args = [], ack = () => {}) => {
            try {
              const safeArgs = Array.isArray(args) ? args : [args];
              const data = await service[funcName](...safeArgs, socket);
              ack({ ok: true, data });
            } catch (err) {
              console.error(`RPC ${serviceName}.${funcName} failed:`, err);
              ack({
                ok: false,
                error: {
                  message: err instanceof Error ? err.message : String(err),
                  service: serviceName,
                  function: funcName,
                },
              });
            }
          });
        }
      }
    });

    console.log('Services ready:', Server.getServices());
  },

  start: async () => {
    Server.app = express();
    Server.server = http.Server(Server.app);
    Server.server.app = Server.app;
    Server.app.use(express.static(path.resolve(process.cwd(), '../client/dist')));

    await new Promise(resolve => Server.server.listen(config.http_port, resolve));
    console.log('listening *:' + config.http_port);
  },
};

export default Server;
