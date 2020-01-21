import express from 'express';
import cookieSession from 'cookie-session';
import compression from 'compression';
import bodyParser from 'body-parser';
import errorHandler from 'errorhandler';
import lusca from 'lusca';
import path from 'path';

import * as oauthControllerAccounts from '../controllers-ais/oauthController';
import * as oauthControllerPayments from '../controllers-pis/oauthController';
import * as oauthControllerConfirmationOfFunds from '../controllers-cof/oauthController';

import * as beginAuthorizeController from '../controllers-ais/beginAuthorizeController';
import * as accountController from '../controllers-ais/accountController';
import * as cardController from '../controllers-ais/cardController';
import * as transactionController from '../controllers-ais/transactionController';
import * as createAccountAuthorizationController from '../controllers-ais/createAuthorizationController';

import * as beginPaymentsController from '../controllers-pis/beginPaymentsController';
import * as createPaymentAuthorizationController from '../controllers-pis/createPaymentAuthorizationController';
import * as submitPaymentController from '../controllers-pis/submitPaymentController';
import * as listAuthorizedController from '../controllers-pis/listAuthorizedController';
import * as cofController from '../controllers-cof/cofController';

import {
    createInterfacesToSessions,
    requireSession,
    getSessions,
} from '../services/session';
import {
    getSecrets,
    loadConfiguration,
    unsetGlobalHttpProxySettings,
} from './config';
import { verifyOauthSession } from '../services/oauthHandler';
import { handleErrors } from './errorHandler';

const createApp = async () => {
    const app = express();
    unsetGlobalHttpProxySettings();
    app.set('port', process.env.PORT || 8181);
    app.set('host', process.env.HOST || '');
    await loadConfiguration();

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
    app.post('/accounts/removeAuthorization', createAccountAuthorizationController.postRemoveAuthorization);
    app.post('/accounts/revokeAuthorization', createAccountAuthorizationController.postRevokeAuthorization);
    app.get('/accounts', createInterfacesToSessions, handleErrors(accountController.renderAccounts));
    app.get('/accounts/:authorizationId/:accountId',
        requireSession, createInterfacesToSessions, handleErrors(accountController.renderAccount));
    app.get('/accounts/transactions/:authorizationId/:accountId',
        requireSession, createInterfacesToSessions, handleErrors(transactionController.renderTransactions));
    app.get('/accounts/transaction/:authorizationId/:accountId',
        requireSession, createInterfacesToSessions, handleErrors(transactionController.renderTransaction));

    // OAuth callbacks
    app.get('/oauth/access_token/accounts', verifyOauthSession, oauthControllerAccounts.getAccessToken);
    app.get('/oauth/access_token/payments', verifyOauthSession, oauthControllerPayments.getAccessToken);
    app.get(
        '/oauth/access_token/confirmation_of_funds',
        verifyOauthSession,
        oauthControllerConfirmationOfFunds.getAccessToken,
    );

    app.get('/cards',
        requireSession, createInterfacesToSessions, handleErrors(cardController.renderCards));
    app.get('/cards/:authorizationId/:cardId',
        requireSession, createInterfacesToSessions, handleErrors(cardController.renderCard));
    app.get('/cards/transactions/:authorizationId/:cardId',
        requireSession, createInterfacesToSessions, handleErrors(cardController.renderCardTransactions));
    app.get('/cards/transaction/:authorizationId/:cardId',
        requireSession, createInterfacesToSessions, handleErrors(cardController.renderCardTransaction));

    app.get('/payments', listAuthorizedController.listAuthorizedPayments);
    app.get('/payments/select-type', beginPaymentsController.selectPaymentType);
    app.get('/payments/begin-authorize', beginPaymentsController.beginAuthorize);
    app.get('/payments/begin-authorize-foreign-payment',
        beginPaymentsController.beginAuthorizeForeign);
    app.post('/payments/createAuthorization',
        createPaymentAuthorizationController.createPaymentToAuthorize);
    app.post('/payments/createForeignPaymentAuthorization',
        createPaymentAuthorizationController.createForeignPaymentToAuthorize);
    app.post('/payments/submit',
        requireSession, submitPaymentController.submitAuthorizedPayments);

    app.get('/cof', cofController.renderFundsConfirmationView);
    app.get('/cof/authorize', cofController.renderAuthorizationStartView);
    app.post('/cof/createAuthorization', cofController.createCofAuthorization);
    app.post('/cof/do-funds-confirmation', requireSession, cofController.doFundsConfirmation);

    // Health check end points for monitoring
    app.get('/health-check', (_, res) => res.sendStatus(200).end());

    return app;
};

export default createApp;
