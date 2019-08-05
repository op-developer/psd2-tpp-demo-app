import express from 'express';
import createApp from './app';
import { logger } from '../services/logger';
import https from 'https';
import * as fs from 'fs';

const logLine = (app: express.Express, useSsl: boolean) => {
  const host = app.get('host');
  const port = app.get('port');
  logger.info(`App is running at ${host}:${port} in ${process.env.APP_ENVIRONMENT} mode. SSL enabled ${useSsl}`);
};

/** @param useSsl Only set to true for localhost environments. */
const configureServer = (useSsl: boolean, app: express.Express) => {
  // Trust the root CA server-cert/ca.pem for this to work
  const options: https.ServerOptions = {
    key: fs.readFileSync('certs/localhost-server/server.key'),
    cert: fs.readFileSync('certs/localhost-server/server.crt'),
  };

  return useSsl ?
    https
      .createServer(options, app)
      .listen(app.get('port'), app.get('host'), () => logLine(app, useSsl)) :
    app.listen(app.get('port'), app.get('host'), () => logLine(app, useSsl));
};

const server = createApp(
  process.env.APP_ENVIRONMENT || 'test',
  process.env.HOST_ENV || 'localhost')
  .then((app) => configureServer(process.env.HOST_ENV !== 'aws', app));

export default server;
