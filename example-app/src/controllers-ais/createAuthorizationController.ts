import { Request, Response } from 'express';
import { errToStr } from '../services/utils';
import { logger } from '../services/logger';
import { createClaimsQuery } from '../services/jwt';
import * as queryString from 'query-string';
import {
    getCurrentSession,
    GlobalSessionData,
    AuthorizationData,
    AuthorizationType,
} from '../services/session';
import { getEnv, getSecrets, createConfiguredClient } from '../app/config';
import { randomBytes } from 'crypto';
import axios, { AxiosResponse } from 'axios';
import { getAccessTokenFromClientCredentials } from '../services/token';
import * as accounts from '../swagger-generated/accounts';
import { performance } from 'perf_hooks';

// Redirect URI to redirect user to the OIDC provider authorization endpoint
const createOidcRedirectUri = (authorizationId: string,
                               oauthState: string, nonce: string) => {
  const env = getEnv();
  const scope = 'openid accounts';
  const clientId = getSecrets().TPP_CLIENT_ID;
  const params = {
    request: createClaimsQuery(authorizationId, oauthState, scope, nonce,
      clientId, env.TPP_OAUTH_CALLBACK_URL_ACCOUNTS),
    response_type: 'code id_token',
    client_id: clientId,
    scope,
    state: oauthState,
    nonce,
    redirect_uri: env.TPP_OAUTH_CALLBACK_URL_ACCOUNTS,
  };
  const redirectUrl = env.OIDC_REDIRECT_URL + '?' + queryString.stringify(params);
  logger.debug(redirectUrl);
  return redirectUrl;
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

const updateSession = (authorizationId: string, req: Request, res: Response) => {
  logger.info(`Store authorizationId ${authorizationId} to session`);
  const sessionData: GlobalSessionData = req.session as any;
  const sessions: AuthorizationData[] = sessionData.authorizations ? sessionData.authorizations : [];

  const auth: AuthorizationData = {
    authorizationType: AuthorizationType.OpPsd2Accounts,
    interface: undefined,
    tokens: undefined,
    authorizationId,
    oauthState: undefined,
  };
  sessionData.authorizations = [auth, ...sessions]  as AuthorizationData[];
  return handleRedirect(res, getCurrentSession(req));
};

const formatExpirationDay = (date: Date, days: number) => {
  const result = new Date(date);
  result.setTime(result.getTime() + (days * 24 * 60 * 60 * 1000));
  return result;
};

/** Create authorizationId using client credentials. */
export const createAuthorizationId = async (authorizationInfo: any) => {
  const start1 = performance.now();
  const token = await getAccessTokenFromClientCredentials();
  const time1 = (performance.now() - start1).toFixed(0);
  logger.info(`${time1} ms Got access token from client credentials`);

  const env = getEnv();
  const authorizationApi = accounts.AuthorizationApiFp();

  const accessToken = token.access_token;

  const accountRequest: accounts.AccountRequest = {
    expires: authorizationInfo.authorizationDays
        ? formatExpirationDay(new Date (), authorizationInfo.authorizationDays)
        : undefined,
    transactionFrom: authorizationInfo.transactionFromDateTime,
    transactionTo: authorizationInfo.transactionToDateTime,
  };

  logger.debug(`Create account request ${JSON.stringify(accountRequest)}`);

  const apiKey = getSecrets().API_KEY;
  const start2 = performance.now();

  const authorization = await authorizationApi.createAuthorization(
    apiKey,
    undefined,
    undefined,
    undefined,
    undefined,
    `Bearer ${accessToken}`,
    accountRequest,
  )(axios.create({ httpsAgent: createConfiguredClient() }), env.PSD2_AIS_API_URL)
    .then((response: AxiosResponse<accounts.Authorization>) => response.data);

  const time2 = (performance.now() - start2).toFixed(0);
  logger.info(`Account request created in ${time2} ms`);
  return authorization.authorizationId;
};

export const postCreateAuthorization = (req: Request, res: Response) => {
  logger.debug(req.body);

  const authorizationInfo = req.body.TransactionRange === 'on' ? {
    transactionFromDateTime: req.body.TransactionRangeFrom,
    transactionToDateTime: req.body.TransactionRangeTo,
  } : {
    authorizationDays: parseInt(req.body.authorizationDays, 10),
  };

  logger.info(`Requesting permissions ${JSON.stringify(authorizationInfo, undefined, 2)}`);
  createAuthorizationId(authorizationInfo)
    .then((authorizationId) => updateSession(authorizationId, req, res))
    .catch((err) =>
      res.status(500).render('error', {
        errorTitle: 'There was an error in the application',
        errorText: errToStr(err),
        tppName: getEnv().TPP_NAME,
        env: process.env.APP_ENVIRONMENT,
      }));
};