import express from 'express';
import expressValidator from 'express-validator';
import cookieSession from 'cookie-session';
import compression from 'compression';
import bodyParser from 'body-parser';
import errorHandler from 'errorhandler';
import lusca from 'lusca';
import path from 'path';

import { createInterfacesToSession, requireSession } from '../services/session';
import { logger } from '../services/logger';
import { loadConfiguration, getSecrets } from './config';

// Controllers (route handlers)
import * as beginAuthorizeController from '../controllers/beginAuthorizeController';
import * as logoutController from '../controllers/logoutController';
import * as accountController from '../controllers-ais/accountController';
import * as transactionController from '../controllers-ais/transactionController';
import * as createAuthorizationController from '../controllers-ais/createAuthorizationController';
import * as oauthController from '../controllers/oauthController';

const createApp = async (envStr: string, host: string) => {
    const app = express();
    process.env.APP_ENVIRONMENT = envStr;
    process.env.HOST_ENV = host;
    app.set('port', process.env.PORT || 8181);
    app.set('host', process.env.HOST || '');
    await loadConfiguration(envStr, host);

    // Express configuration
    app.set('views', path.join(__dirname, '../../views'));
    app.set('view engine', 'pug');
    app.use(compression());
    // app.use(logger('dev'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.disable('x-powered-by');
    /** Error Handler. Provides full stack - remove for production */
    app.use(errorHandler());
    app.use(expressValidator());
    app.use(cookieSession({
        name: 'session',
        keys: [getSecrets().SESSION_SECRET],
        maxAge: 24 * 60 * 60 * 1000 * 7, // a week
    }));
    app.use(lusca.xframe('SAMEORIGIN'));
    app.use(lusca.xssProtection(true));

    app.use(
      express.static(path.join(__dirname, '../../public'), { maxAge: 31557600000 }),
    );

    app.get('/', beginAuthorizeController.selectBank);
    app.get('/begin', (_, res) => res.redirect('/'));
    app.get('/authorize', beginAuthorizeController.beginAuthorize);
    app.get('/robots.txt', (_, res) => res.send('User-agent: *\nDisallow: /\n'));

    app.get('/logout', logoutController.logout);

    // Authentication flow starting point
    app.post('/createAuthorization', createAuthorizationController.postCreateAuthorization);
    // OAuth callback url
    app.get('/oauth/access_token', oauthController.getAccessToken);

    // Authenticated user endpoints where session is required
    app.get('/accounts',
        requireSession, createInterfacesToSession, accountController.renderAccounts);
    app.get('/accounts/:authorizationId/:accountId',
        requireSession, createInterfacesToSession, accountController.renderAccount);
    app.get('/accounts/transactions/:authorizationId/:accountId',
        requireSession, createInterfacesToSession, transactionController.renderTransactions);
    app.get('/accounts/transaction/:authorizationId/:accountId',
        requireSession, createInterfacesToSession, transactionController.renderTransaction);

    // Health check end points for monitoring
    app.get('/health-check', (_, res) => res.sendStatus(200).end());

    return app;
};

export default createApp;
