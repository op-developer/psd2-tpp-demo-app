import fetch from 'node-fetch';
import {
    AuthorizedPayments,
    ForeignPayment,
    PaymentErrorPayload } from '../models/paymentModels';
import { logger } from '../services/logger';
import { constructPaymentErrorMessage, getCommonHeaders } from './paymentUtils';
import { createConfiguredClient, getEnv, getSecrets } from '../app/config';
import { v4 as uuid } from 'uuid';
import { Request } from 'express';
import { AuthorizationData, AuthorizationType, getSessions } from '../services/session';
import { getSsaSigningKey, createDetachedSignature, verifyResponseSignature } from '../services/jwt';
import * as payments from '../swagger-generated/payments/api';

const env = getEnv();

export const handlePaymentCreation = async (
                                            accessToken: string,
                                            paymentAmount: number, payeeAccount: string,
                                            payeeName: string, message: string,
                                            bundlePaymentCount: number,
                                            recurringPaymentCount: number,
                                            payerAccount?: string,
                                            authorizationId?: string,
                                            ): Promise<payments.SepaPaymentDetails> => {
    logger.debug(`bundlePaymentCount: ${bundlePaymentCount} recurringPaymentCount ${recurringPaymentCount} payerAccount: ${payerAccount}`);
    const payment: payments.SepaPaymentDetails = await createSinglePayment(
        accessToken,
        payeeAccount,
        payeeName,
        paymentAmount,
        message,
        recurringPaymentCount,
        authorizationId,
        payerAccount,
    );

    // Bundle payments are created within same authorizationId
    for (let i = 1; i < bundlePaymentCount; ++i) {
        await createSinglePayment(
            accessToken,
            payeeAccount,
            payeeName,
            paymentAmount,
            message,
            1,
            payment.authorizationId,
            payerAccount,
        );
    }
    return payment;
};

export const createSinglePayment = async (
    accessToken: string,
    toAccount: string,
    toName: string,  amount: number,
    message: string, recurringPaymentCount: number,
    authorizationId?: string,
    payer?: string): Promise<payments.SepaPaymentDetails> => {
    const sessionId = uuid();
    const sepaPaymentRequest: payments.SepaPaymentRequest = {
        authorizationId, // Bundle payments share the authorizationId
        count: recurringPaymentCount,
        payee: {
            iban: toAccount,
            name: toName,
        },
        amountEUR: amount.toFixed(2),
        message,
    };
    if (payer) {
        sepaPaymentRequest.payer = {iban: payer};
    }
    const response = await initSinglePayment(accessToken, sessionId, sepaPaymentRequest);
    if (!response.ok) {
        const errBody = await response.json();
        logger.error(`Received following error from payments: ${errBody}`);
        const paymentError: PaymentErrorPayload = {
            httpCode: response.status,
            errorDescription: constructPaymentErrorMessage(errBody),
        };
        throw paymentError;
    }
    try {
        const payment = await response.text();
        const verified = await verifyResponseSignature(response.headers.get('x-jws-signature') as string, payment);
        if (!verified) {
            logger.error(`Payment verification failed with id: ${JSON.parse(payment).authorizationId}`);
            throw new Error('Response signature validation failed.');
        }
        else {
            logger.info(`created single payment with id: ${JSON.parse(payment).authorizationId}`);
            return JSON.parse(payment);
        }
    }
    catch (e) {
        logger.error(`[createSinglePayment()]: ${e}`);
        throw e;
    }
};

export const initSinglePayment = async (token: string, sessionId: string, singlePayment: payments.SepaPaymentRequest) => {
    const detachedSignature = createDetachedSignature(
        singlePayment,
        getSsaSigningKey(process.env.APP_ENVIRONMENT as string),
    );
    const headers = {'x-jws-signature' : detachedSignature, ...getCommonHeaders(token, sessionId)};
    try {
        const response = await fetch(env.PSD2_PIS_API_URL + '/sepa-payments', {
            agent: getEnv().APP_ENVIRONMENT.includes('sandbox-test') ? undefined : createConfiguredClient(),
            method: 'POST',
            body: JSON.stringify(singlePayment),
            headers,
        });
        return response;
    }
    catch (e) {
        logger.error(`[initSinglePayment()]: ${e}`);
        throw e;
    }
};

export const createSingleForeignPayment = async (
    token: string,
    sessionId: string,
    foreignPayment: ForeignPayment): Promise<ForeignPayment> => {
    const response = await initForeignPayment(token, sessionId, foreignPayment);
    if (!response.ok) {
        const errJson = await response.json();
        const paymentError: PaymentErrorPayload = {
            httpCode: response.status,
            errorDescription: constructPaymentErrorMessage(errJson),
        };
        throw paymentError;
    }
    const payment = await response.text();
    const verified = await verifyResponseSignature(response.headers.get('x-jws-signature') as string, payment);
    if (!verified) {
        throw new Error('Response signature validation failed.');
    }
    logger.info(`created payment with id: ${JSON.parse(payment).authorizationId}`);
    return JSON.parse(payment);
};

const initForeignPayment = async (token: string, sessionId: string,
                            foreignPayment: ForeignPayment) => {
    const detachedSignature = createDetachedSignature(
        foreignPayment,
        getSsaSigningKey(process.env.APP_ENVIRONMENT as string),
    );
    const headers = {...getCommonHeaders(token, sessionId), 'x-jws-signature' : detachedSignature};
    try {
        const response = await fetch(getEnv().PSD2_PIS_API_URL + '/foreign-payments', {
            agent: createConfiguredClient(),
            method: 'POST',
            body: JSON.stringify(foreignPayment),
            headers,
        });
        return response;
    }
    catch (e) {
        logger.error(`[initForeignPayment()]: ${e}`);
        throw e;
    }
};

export const getPaymentsByAuthorization = async (authorizationId: any,
                                                 token: any): Promise<AuthorizedPayments> => {
    logger.info(`fetching payments with auth id: ${authorizationId}`);
    const response = await fetchPaymentsByAuthorizationId(
        authorizationId,
        token,
    );

    if (response.ok) {
        const paymentsResponse: AuthorizedPayments = await response.json();
        logger.debug(`Fetched payments by authorization id ${authorizationId}: ${JSON.stringify(paymentsResponse)}`);
        paymentsResponse.authorizedCount = paymentsResponse.payments.filter((curPayment) => curPayment.status === 'Authorized').length;
        return paymentsResponse;
    }
    logger.error(`error fetching payments by authorization id ${authorizationId}`);
    logger.error(response);
    const errJson = await response.json();
    logger.error(JSON.stringify(errJson));
    return {
        authorizedCount: 0,
        payments: [],
    };
};

const fetchPaymentsByAuthorizationId = (authorizationId: string, token: string) => {
    const sessionId = uuid();
    const headers: any = getCommonHeaders(token, sessionId);
    logger.debug(`Headers to getPayments by authorization id: ${JSON.stringify(headers)}`);
    return fetch(`${getEnv().PSD2_PIS_API_URL}/authorizations/${authorizationId}/payments`, {
        agent: createConfiguredClient(),
        method: 'GET',
        headers,
    });
};

export const submitSepaPayment = async (accessToken: string,
                                        paymentId: string) => {
    try {
        const sessionId = uuid();
        const headers = getCommonHeaders(accessToken, sessionId);
        logger.debug(`[submitSepaPayment()]: ${env.PSD2_PIS_API_URL}/sepa-payments/${paymentId}/submissions/${sessionId}`);
        const response = await fetch(env.PSD2_PIS_API_URL + '/sepa-payments/' + paymentId + '/submissions/' + sessionId, {
            agent: createConfiguredClient(),
            method: 'PUT',
            headers,
        });
        if (!response.ok) {
            const errBody = await response.json();
            logger.error(`Received following error from payments: ${JSON.stringify(errBody)}`);
            const paymentError: PaymentErrorPayload = {
                httpCode: response.status,
                errorDescription: constructPaymentErrorMessage(errBody),
            };
            throw paymentError;
        }
        return response;
    }
    catch (e) {
        logger.error('Payment request failed');
        logger.error(e.errorDescription);
        throw e;
    }
};

export const collectAuthorizations = async (req: Request): Promise<AuthorizedPayments[]> => {
    const sessions: AuthorizationData[] = getSessions(req) as AuthorizationData[];
    const paymentAuthorizations = sessions
        .filter((curSession) => curSession.authorizationType === AuthorizationType.OpPsd2Payments);

    const authorizations: AuthorizedPayments[] = await Promise.all(paymentAuthorizations.map(async (curAuth) => {
        const tokens = curAuth.tokens;
        const accessToken = tokens ? tokens.access_token : '';
        return getPaymentsByAuthorization(curAuth.authorizationId, accessToken);
    }));

    logger.info(`Authorizations: ${JSON.stringify(authorizations)}`);

    return authorizations;
};
