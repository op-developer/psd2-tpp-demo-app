import express from 'express';
import expressValidator from 'express-validator';
import cookieSession from 'cookie-session';
import compression from 'compression';
import bodyParser from 'body-parser';
import errorHandler from 'errorhandler';
import lusca from 'lusca';
import path from 'path';

import * as oauthControllerAccounts from '../controllers-ais/oauthController';

import * as beginAuthorizeController from '../controllers-ais/beginAuthorizeController';
import * as accountController from '../controllers-ais/accountController';
import * as transactionController from '../controllers-ais/transactionController';
import * as createAccountAuthorizationController from '../controllers-ais/createAuthorizationController';

import { createInterfacesToSessions, requireSession, getSessions } from '../services/session';
import { getSecrets, loadConfiguration } from './config';
import { verifyOauthSession } from '../services/oauthHandler';

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

    app.get('/robots.txt', (_, res) => res.send('User-agent: *\nDisallow: /\n'));

    // Remove one session at a time
    app.get('/logout', (req, res) => {
        const sessions = getSessions(req);
        if (sessions !== undefined) {
          sessions.shift();
        }
        res.redirect('/');
      });

    // Default to accounts
    app.get('/', (_, res) => res.redirect('/accounts'));

    // Accounts
    app.get('/accounts/authorize', beginAuthorizeController.beginAuthorize);
    app.post('/accounts/createAuthorization', createAccountAuthorizationController.postCreateAuthorization);
    app.get('/accounts', createInterfacesToSessions, accountController.renderAccounts);
    app.get('/accounts/:authorizationId/:accountId',
        requireSession, createInterfacesToSessions, accountController.renderAccount);
    app.get('/accounts/transactions/:authorizationId/:accountId',
        requireSession, createInterfacesToSessions, transactionController.renderTransactions);
    app.get('/accounts/transaction/:authorizationId/:accountId',
        requireSession, createInterfacesToSessions, transactionController.renderTransaction);

    // OAuth callbacks
    app.get('/oauth/access_token/accounts', verifyOauthSession, oauthControllerAccounts.getAccessToken);

    // Health check end points for monitoring
    app.get('/health-check', (_, res) => res.sendStatus(200).end());

    return app;
};

export default createApp;
