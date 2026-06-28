import path from 'path';
import http from 'http';
import https from 'https';
import express from 'express';
import config from './config.js';
import { Server as IOServer } from 'socket.io';

const Server = {
  services: new Map(),

  getServices: () =>
    Object.fromEntries(
      [...Server.services].map(([key, value]) => [
        key,
        Object.keys(value).filter(
          attr => typeof value[attr] === 'function' && attr !== 'init' && !attr.startsWith('_')
        ),
      ])
    ),

  init: async services => {
    Server.io = new IOServer(Server.server, {
      cors: {
        // allow debug port
        origin: `http://${config.pi_ip}:5173`,
        methods: ['GET', 'POST'],
      },
      maxHttpBufferSize: 20 * 1024 * 1024,
    });

    Server.io.on('connect', socket => {
      socket.on('getServices', (_, ack) => ack(Server.getServices()));
      const services = Server.getServices();
      for (let s in services) {
        const service = Server.services.get(s);
        for (let f of services[s]) {
          socket.on(s + '.' + f, async (args, ack) => {
            ack(await service[f](...args, socket));
          });
        }
      }
    });

    for (let service of services) {
      service.server = Server;
      await service.init(Server);
      Server.services.set(service.name, service);
    }

    console.log(Server.getServices());
  },

  start: async () => {
    Server.app = express();
    Server.server = http.Server(Server.app);
    Server.server.app = Server.app;

    Server.app.use(express.static(path.resolve(process.cwd(), '../client/dist')));

    const res = await Server.server.listen(config.http_port);
    console.log('listening *:' + config.http_port);
  },
};

export default Server;
