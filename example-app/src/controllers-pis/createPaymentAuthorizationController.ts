import { Request, Response } from 'express';
import { getEnv, getSecrets } from '../app/config';
import { logger } from '../services/logger';
import { v4 as uuid } from 'uuid';
import { handleErrorResponse, isValidForeignPayment, isValidPayment } from './paymentUtils';
import { ForeignPayment } from '../models/paymentModels';
import { performance } from 'perf_hooks';
import { getAccessTokenFromClientCredentials, TokenData, getTokensForExemption } from '../services/token';
import { logErrorMessage } from '../services/utils';
import { AuthorizationData, getCurrentSession, GlobalSessionData, AuthorizationType, getSessions } from '../services/session';
import { createClaimsQuery, getSsaSigningKey } from '../services/jwt';
import * as queryString from 'query-string';
import { createSingleForeignPayment, handlePaymentCreation } from './payments';
import { randomBytes } from 'crypto';

const env = getEnv();

export const createPaymentToAuthorize = async (req: Request, res: Response): Promise<any> => {
    logger.debug(`Payment request:  ${JSON.stringify(req.body)}`);

    if (isValidPayment(req)) {
        const token: string = req.body.accessToken ? req.body.accessToken : await getAccessTokenFromClientCredentials('payments').then((tokenData) => tokenData.access_token);
        const payerAccount: string = req.body.payerAccount ? req.body.payerAccount.replace(/\s/g, '') : undefined;
        const paymentAmount = parseFloat(req.body.paymentAmount.replace(',', '.'));
        const payeeAccount = req.body.payeeAccount.replace(/\s/g, '');
        const payeeName = req.body.payeeName;
        const message = req.body.message || 'DEMO PSD2 PAYMENT';
        const bundlePaymentCount = parseInt(req.body.bundlePaymentCount, 10);
        const recurringPaymentCount = parseInt(req.body.recurringPaymentCount, 10);
        try {
            const start1 = performance.now();
            const time1 = (performance.now() - start1).toFixed(0);
            logger.info(`${time1} ms Got access token: ${token}`);
                const payment = await handlePaymentCreation(
                    token,
                    paymentAmount,
                    payeeAccount,
                    payeeName,
                    message,
                    bundlePaymentCount,
                    recurringPaymentCount > 0 ? recurringPaymentCount : 1,
                    payerAccount,
                );
            startAuthorizePayment(payment.authorizationId, req, res);
        }
        catch (err) {
            handleErrorResponse(err, res);
        }
    } else {
        res.status(400).render('payment-error', {
            errorTitle: 'There was an error in the application',
            errorText: 'Payment is not valid for authorizing',
            tppName: env.TPP_NAME,
            env: process.env.APP_ENVIRONMENT,
        });
    }
};

export const createForeignPaymentToAuthorize = async (req: Request, res: Response): Promise<any> => {
    logger.debug(`Foreign payment request received:  ${JSON.stringify(req.body)}`);

    if (isValidForeignPayment(req)) {
        try {
            logger.debug('payment validated, starting creation');
            const payment: ForeignPayment = await createForeignPayment(req);
            startAuthorizePayment(payment.authorizationId, req, res);
        } catch (err) {
            logger.error('Error in foreign payment');
            handleErrorResponse(err, res);
        }

    } else {
        res.status(400).render('payment-error', {
            errorTitle: 'There was an error in the application',
            errorText: 'Payment is not valid for authorizing',
            tppName: env.TPP_NAME,
            env: process.env.APP_ENVIRONMENT,
        });
    }

};

const createForeignPayment = async (req: Request) => {

    let paymentAmount = req.body.paymentAmount.replace(',', '.');
    const parts: string[] = paymentAmount.split('.');
    if (parts.length === 2 && parts[1].length === 1) {
        paymentAmount = `${paymentAmount}0`;
    }
    const payeeAccount = req.body.payeeAccountId.replace(/\s/g, '');

    const foreignPayment: ForeignPayment = {
      payee: {
          bankAccount: {
              schemeName: req.body.payeeAccountScheme,
              id: payeeAccount,
              issuer: req.body.payeeAccountIssuer,
          },
          name: req.body.payeeName,
          foreignAddress: {
              addressLine1: req.body.payeeAddr1,
              addressLine2: req.body.payeeAddr2,
              country: req.body.payeeCountry,
          },
          financialInstitution: {
              bic: req.body.payeeBic,
           },
      },
      amount: paymentAmount,
      currency: req.body.paymentCurrency,
      message: req.body.message ? req.body.message : `Foreign payment ${req.body.payeeBic}`,
      count: 1,
    };

    const sessionId = uuid();
    const start1 = performance.now();
    const tokens: TokenData = await getAccessTokenFromClientCredentials('payments');
    const time1 = (performance.now() - start1).toFixed(0);
    logger.info(`${time1} ms Got access token from client credentials`);

    const payment: ForeignPayment = await createSingleForeignPayment (
        tokens.access_token,
        sessionId,
        foreignPayment,
    );

    logger.debug(`Foreign Payment is created, happy day! ${JSON.stringify(payment)}`);
    return payment;
};

const startAuthorizePayment = (authorizationId: string | undefined, req: Request, res: Response) => {
    try {
        logger.debug('starting payment authorization');
        return updateSession(authorizationId, req, res);
    } catch (err) {
        logger.error(err);
        res.status(500).render('payment-error', {
            errorTitle: 'There was an error in the application',
            errorText: logErrorMessage(err),
            tppName: env.TPP_NAME,
            env: process.env.APP_ENVIRONMENT,
        });
    }
};

const handleRedirect = (req: Request, res: Response, session: AuthorizationData, exemption: boolean) => {
    const oauthState = randomBytes(12).toString('hex');
    const nonce = randomBytes(12).toString('hex');
    session.oauthState = oauthState;
    session.nonce = nonce;
    if (!exemption) {
        return res.redirect(createOidcRedirectUri(session.authorizationId, oauthState, nonce));
    }
    else {
        return handleExemption(req, res, session.authorizationId, oauthState, nonce);
    }
};

export const updateSession = (authorizationId: string | undefined, req: Request, res: Response) => {
    logger.info(`Store authorizationId ${authorizationId} to session`);
    const sessionData: GlobalSessionData = req.session as any;
    const sessions: AuthorizationData[] = sessionData.authorizations ? sessionData.authorizations : [];
    const auth = {
        authorizationType: AuthorizationType.OpPsd2Payments,
        interface: undefined,
        tokens: undefined,
        authorizationId,
        oauthState: undefined,
    };
    sessionData.authorizations = [auth, ...sessions]  as AuthorizationData[];
    return handleRedirect(
                            req,
                            res,
                            getCurrentSession(req),
                            (req.body.accessToken),
                        );
};

const handleExemption = async (
                                req: Request,
                                res: Response,
                                authorizationId: string | undefined,
                                oauthState: string,
                                nonce: string,
                            ) => {
    const clientId = getSecrets().TPP_CLIENT_ID;
    const secret = getSecrets().TPP_CLIENT_SECRET;
    try {
        const tokens = await getTokensForExemption(
                                                        oauthState,
                                                        nonce,
                                                        authorizationId,
                                                        clientId,
                                                        secret,
                                                    );
        const sessionData: GlobalSessionData = req.session as any;
        const thisAuthorization = sessionData.authorizations.filter((a) => a.authorizationId === authorizationId);
        thisAuthorization[0].tokens = tokens;
        logger.info('[handleExemption()]: done, tokens: ', tokens);
        res.redirect('/payments');
    }
    catch (err) {
        logger.error(err);
        res.status(500).render('payment-error', {
        errorTitle: 'Exemption not allowed',
        errorText: logErrorMessage(err),
        tppName: env.TPP_NAME,
        env: process.env.APP_ENVIRONMENT,
    });
}
};

const createOidcRedirectUri = (authorizationId: any,
                               oauthState: string, nonce: string) => {
    const scope = 'openid payments';
    const clientId = getSecrets().TPP_CLIENT_ID;
    const ssaSigningKey = getSsaSigningKey(process.env.APP_ENVIRONMENT as string);
    const params = {
        request: createClaimsQuery(authorizationId, oauthState, scope, nonce,
            clientId, env.TPP_OAUTH_CALLBACK_URL_PAYMENTS, ssaSigningKey),
        response_type: 'code id_token',
        client_id: clientId,
        scope,
        state: oauthState,
        nonce,
        redirect_uri: env.TPP_OAUTH_CALLBACK_URL_PAYMENTS,
    };
    const redirectUrl = env.OIDC_REDIRECT_URL + '?' + queryString.stringify(params);
    logger.debug(redirectUrl);
    return redirectUrl;
};
