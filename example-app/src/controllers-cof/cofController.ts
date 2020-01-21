import * as cofApi from '../swagger-generated/cof';
import axios, { AxiosResponse } from 'axios';
import {
  Request,
  Response,
} from 'express';
import {
  createConfiguredClient,
  getEnv,
  getSecrets,
} from '../app/config';
import { logger } from '../services/logger';
import { performance } from 'perf_hooks';
import {
  getAccessTokenFromClientCredentials,
  TokenData,
} from '../services/token';
import moment from 'moment';
import {
  AuthorizationData,
  getCurrentSession,
  GlobalSessionData,
  AuthorizationType,
} from '../services/session';
import { createClaimsQuery, getSsaSigningKey } from '../services/jwt';
import { v4 as uuid } from 'uuid';
import * as queryString from 'query-string';
import { logErrorMessage } from '../services/utils';
import { randomBytes } from 'crypto';

export const renderAuthorizationStartView = (req: Request, res: Response) => {
  const yearFromNow = new Date();
  yearFromNow.setFullYear(yearFromNow.getFullYear() + 1);
  res.render('begin-authorize-cof', {
    title: 'Start confirmation of funds authorization',
    tppName: getEnv().TPP_NAME,
    env: process.env.APP_ENVIRONMENT,
    initialIban: 'FI8659986920068681',
    initialExpires: (yearFromNow).toISOString().split('T')[0],
  });
};

export const renderBankSelectionView = (req: Request, res: Response) => {
  res.render('select-bank-cof', {
    title: 'Select bank for confirmation of funds',
    tppName: getEnv().TPP_NAME,
    env: process.env.APP_ENVIRONMENT,
  });
};

export const renderFundsConfirmationView = (req: Request, res: Response) => {
  const session = getCurrentSession(req);
  return res.render('cof', {
    isLoggedIn: true,
    title: 'Confirmation of Funds',
    tppName: getEnv().TPP_NAME,
    authorizationId: session ? session.authorizationId : '',
    iban: session ? session.cofIban : '',
    confirmedAmountEur: req.body.confirmedAmountEur,
    fundsAvailable: req.body.fundsAvailable,
    linkToNextPage: '/cof/authorize',
    env: process.env.APP_ENVIRONMENT,
  });
};

const isTokenExpired = (err: any) =>
  err.response &&
  err.response.statusCode === 401 &&
  err.response.body &&
  err.response.body.fault &&
  err.response.body.fault.detail &&
  err.response.body.fault.detail.errorcode === 'keymanagement.service.access_token_expired';

const isAuthorizationRevoked = (err: any) =>
  err.response &&
  err.response.statusCode === 403 &&
  err.response.body &&
  err.response.body.errors &&
  err.response.body.errors[0].type === 'SECURITY' &&
  err.response.body.errors[0].message.startsWith('Authorization ');

const handleRenderError = (err: any, res: Response) => {
  if (isTokenExpired(err)) {
    return res.status(200).render('token-expired', {
      isLoggedIn: true,
      title: 'Access Token',
      tppName: getEnv().TPP_NAME,
      env: process.env.APP_ENVIRONMENT,
    });
  }
  if (isAuthorizationRevoked(err)) {
    return res.status(200).render('authorization-revoked', {
      isLoggedIn: true,
      title: 'Authorization Revoked',
      tppName: getEnv().TPP_NAME,
      env: process.env.APP_ENVIRONMENT,
    });
  }
  res.status(500).render('error', {
    errorTitle: 'There was an error in the application',
    errorText: logErrorMessage(err),
    env: process.env.APP_ENVIRONMENT,
    tppName: getEnv().TPP_NAME,
  });
};

const parseExpiresDate = (req: Request) => {
  return moment(req.body.cofExpires).isValid() ? new Date(req.body.cofExpires) : undefined;
};

export const createCofAuthorization = async (req: Request, res: Response) => {

  logger.info(`Creating CoF authorization, predefined values ${JSON.stringify(req.body, undefined, 2)}`);

  const iban = req.body.cofIban;
  const expires = parseExpiresDate(req);

  let requestBody: cofApi.CreateAuthorizationRequestSchema = {};

  if (iban) {
    requestBody = { ...requestBody, iban };
  }

  if (expires) {
    requestBody = { ...requestBody, expires };
  }

  logger.info(`Creating CoF authorization with request:  ${JSON.stringify(requestBody)}`);

  const start = performance.now();
  const tokens: TokenData = await getAccessTokenFromClientCredentials('fundsconfirmations');
  const duration = (performance.now() - start).toFixed(0);
  logger.info(`${duration} ms Got access token from client credentials`);

  const authorizationApi = cofApi.AuthorizationApiFp();
  const env = getEnv();
  const apiKey = getSecrets().API_KEY;
  const accessToken = tokens.access_token;
  const xSessionId = uuid();
  const xRequestId = uuid();
  const xFapiInteractionId = uuid();

  logger.info(`About to send create authorization request with x-session-id: ${xSessionId} `
    .concat(`, x-request-id: ${xRequestId} and x-fapi-interaction-id: ${xFapiInteractionId}`));

  try {
    const authorization = await authorizationApi.createAuthorization(
      `Bearer ${accessToken}`,
      'application/json',
      apiKey,
      undefined,
      undefined,
      undefined,
      undefined,
      requestBody,
    )(axios.create({
      httpsAgent: createConfiguredClient(),
      headers: {
        'x-session-id': xSessionId,
        'x-request-id': xRequestId,
        'x-fapi-interaction-id': xRequestId,
      },
    }), env.PSD2_COF_API_URL)
      .then((response: AxiosResponse<cofApi.CreateAuthorizationResponseSchema>) => response.data);
    const authorizationId = authorization.authorizationId;
    updateSession(authorizationId, undefined, req, res);
    return authorizationId;
  } catch (e) {
    if (e.response) {
      logger.error(`Error while creating CoF authorization, got answer: ${JSON.stringify(e.response.data,
        undefined, 2)}`);
    }
    handleRenderError(e, res);
  }
};

export const fetchCofAuthorizationIbanToSession = async (req: Request) => {
  const authorizationApi = cofApi.AuthorizationApiFp();
  const env = getEnv();
  const apiKey = getSecrets().API_KEY;
  const tokens = getCurrentSession(req).tokens;
  const authorizationId = getCurrentSession(req).authorizationId;
  const xSessionId = uuid();
  const xRequestId = uuid();
  const xFapiInteractionId = uuid();

  logger.info(`About to get CoF authorization with id ${authorizationId} (x-session-id: ${xSessionId} `
    .concat(`, x-request-id: ${xRequestId} and x-fapi-interaction-id: ${xFapiInteractionId})`));

  // @ts-ignore
  const accessToken = tokens.access_token;

  try {
    const authorization = await authorizationApi.getAuthorization(
      // @ts-ignore
      authorizationId,
      'application/json',
      `Bearer ${accessToken}`,
      apiKey,
      undefined,
      undefined,
      xFapiInteractionId,
      undefined,
    )(axios.create({
      httpsAgent: createConfiguredClient(),
      headers: {
        'x-session-id': xSessionId,
        'x-request-id': xRequestId,
        'x-fapi-interaction-id': xFapiInteractionId,
      },
    }), env.PSD2_COF_API_URL)
      .then((response: AxiosResponse<cofApi.GetAuthorizationResponseSchema>) => response.data);
    getCurrentSession(req).cofIban = authorization.iban;
  } catch (e) {
    if (e.response) {
      logger.error(`Error while getting CoF authorization by id ${authorizationId}, `
        .concat(`got answer: ${JSON.stringify(e.response.data, undefined, 2)}`));
    }
    throw e;
  }
};

export const doFundsConfirmation = async (req: Request, res: Response) => {

  const requestBody: cofApi.FundsConfirmationRequestSchema = {
    authorizationId: req.body.authorizationId,
    amountEUR: req.body.amountEUR,
  };

  logger.info(`About to do confirmation of funds: ${JSON.stringify(requestBody, undefined, 2)}`);

  const fundsConfirmationApi = cofApi.FundsConfirmationApiFp();
  const env = getEnv();
  const apiKey = getSecrets().API_KEY;
  const tokens = getCurrentSession(req).tokens;
  const xSessionId = uuid();
  const xRequestId = uuid();
  const xFapiInteractionId = uuid();

  logger.info(`About to send funds confirmation request with x-session-id: ${xSessionId} `
    .concat(`and x-request-id: ${xRequestId} and x-fapi-interaction-id: ${xFapiInteractionId})`));

  // @ts-ignore
  const accessToken = tokens.access_token;

  try {
    const confirmation: any = await fundsConfirmationApi.createFundsConfirmation(
      `Bearer ${accessToken}`,
      'application/json',
      apiKey,
      undefined,
      undefined,
      undefined,
      undefined,
      requestBody,
    )(axios.create({
      httpsAgent: createConfiguredClient(),
      headers: {
        'x-session-id': xSessionId,
        'x-request-id': xRequestId,
        'x-fapi-interaction-id': xFapiInteractionId,
      },
    }), env.PSD2_COF_API_URL)
      .then((response: AxiosResponse<cofApi.FundsConfirmationResponseSchema>) => response.data)
      .catch((err: Error) => {
        throw err;
      });

    logger.info(`Got answer for funds confirmation: ${JSON.stringify(confirmation, undefined, 2)}`);

    // @ts-ignore
    const updatedReq: Request = {
      ...req,
      body: {
        confirmedAmountEur: confirmation.amountEUR,
        fundsAvailable: confirmation.fundsAvailable,
      },
    };

    renderFundsConfirmationView(updatedReq, res);
  } catch (e) {
    if (e.response) {
      logger.error(`Error while making funds confirmation, got answer: ${JSON.stringify(e.response.data,
        undefined, 2)}`);
    }
    handleRenderError(e, res);
  }
};

export const updateSession = (authorizationId: string | undefined, cofIban: string | undefined,
                              req: Request, res: Response) => {
  logger.info(`Store authorizationId ${authorizationId} to session`);
  const sessionData: GlobalSessionData = req.session as any;
  const sessions: AuthorizationData[] = sessionData.authorizations ? sessionData.authorizations : [];

  const auth: AuthorizationData = {
    authorizationType: AuthorizationType.OpPsd2Cof,
    interface: undefined,
    tokens: undefined,
    authorizationId,
    oauthState: undefined,
    cofIban,
  };
  sessionData.authorizations = [auth, ...sessions] as AuthorizationData[];
  return handleRedirect(res, getCurrentSession(req));
};

const handleRedirect = (res: Response, session: AuthorizationData) => {
  const oauthState = randomBytes(12).toString('hex');
  const nonce = randomBytes(12).toString('hex');
  session.oauthState = oauthState;
  session.nonce = nonce;
  if (!session.authorizationId) {
    throw new Error('Missing authorizationId');
  }
  return res.redirect(createOidcRedirectUri(session.authorizationId, oauthState, nonce));
};

const createOidcRedirectUri = (authorizationId: any, oauthState: string, nonce: string) => {
  const env = getEnv();
  const scope = 'openid fundsconfirmations';
  const clientId = getSecrets().TPP_CLIENT_ID;
  const ssaSigningKey = getSsaSigningKey(process.env.APP_ENVIRONMENT as string);
  const params = {
    request: createClaimsQuery(
      authorizationId,
      oauthState,
      scope,
      nonce,
      clientId,
      env.TPP_OAUTH_CALLBACK_URL_CONFIRMATION_OF_FUNDS,
      ssaSigningKey,
    ),
    response_type: 'code id_token',
    client_id: clientId,
    scope,
    state: oauthState,
    nonce,
    redirect_uri: env.TPP_OAUTH_CALLBACK_URL_CONFIRMATION_OF_FUNDS,
  };
  const redirectUrl = env.OIDC_REDIRECT_URL + '?' + queryString.stringify(params);
  logger.debug(redirectUrl);
  return redirectUrl;
};
