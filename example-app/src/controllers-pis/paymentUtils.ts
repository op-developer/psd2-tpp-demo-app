import { logger } from '../services/logger';
import { getEnv, getSecrets } from '../app/config';
import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';

interface CommonHeaders {
    'Authorization': string;
    'x-api-key': string;
    'Accept': string;
    'x-session-id': string;
    'x-idempotency-key': string;
    'x-request-id': string;
    'x-fapi-interaction-id': string;
    [key: string]: string;
}

const clientCertForSandbox = getEnv().CLIENT_CERTIFICATE
  .replace('-----BEGIN CERTIFICATE-----', '')
  .replace('-----END CERTIFICATE-----', '')
  .replace(/(\r\n|\n|\r)/gm, '')
  .trim();

// Session ID MUST be the same as used with the testloginservice
export const getCommonHeaders = (bearerToken: string, xSessionId: string): CommonHeaders =>  {
  const headers: CommonHeaders = {
    'Authorization': `Bearer ${bearerToken}`,
    'x-api-key': getSecrets().API_KEY,
    'Accept': 'application/json',
    'x-session-id': xSessionId,
    'x-idempotency-key': uuid(),
    'x-request-id': uuid(),
    'x-fapi-interaction-id': uuid(),
  };
  if (getEnv().APP_ENVIRONMENT.includes('sandbox')) {
    headers['x-client-certificate'] = clientCertForSandbox;
  }
  return headers;
};

export const handleErrorResponse = (error: any, res: Response) => {
    logger.error(error);
    error.httpCode = error.httpCode ? error.httpCode : 500;
    error.errorDescription = error.errorDescription ? error.errorDescription : 'Unexpected error occurred';

    res.status(error.httpCode).render('payment-error', {
        errorTitle: 'There was an error in the application',
        errorText: error.errorDescription,
        tppName: getEnv().TPP_NAME,
        env: getEnv().APP_ENVIRONMENT,
    });
};

export const constructPaymentErrorMessage = (errJson: any): string => {
    return errJson.violations && errJson.violations.length > 0 ? errJson.violations[0].message : errJson.message;
};

export const isValidPayment = (req: Request): boolean => {

    const amountStr = req.body.paymentAmount ? req.body.paymentAmount.replace(',', '.') : undefined;
    logger.debug(`amount string: ${amountStr}`);
    return amountStr
         && !isNaN(amountStr)
        && parseFloat(req.body.paymentAmount)
        && req.body.payeeAccount
        && req.body.payeeName
        && req.body.bundlePaymentCount
        && !isNaN(req.body.bundlePaymentCount);
};

export const isValidForeignPayment = (req: Request): boolean => {
    const amountStr = req.body.paymentAmount ? req.body.paymentAmount.replace(',', '.') : undefined;
    logger.debug(`amount string: ${amountStr}`);
    return amountStr
        && !isNaN(amountStr)
        && parseFloat(req.body.paymentAmount)
        && req.body.paymentCurrency
        && req.body.payeeName
        && req.body.payeeAddr1
        && req.body.payeeAddr2
        && req.body.payeeCountry
        && req.body.payeeAccountScheme
        && req.body.payeeAccountId
        && req.body.payeeAccountIssuer
        && req.body.bundlePaymentCount;
};
