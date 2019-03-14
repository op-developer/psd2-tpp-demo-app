import * as AccountsApi from '../swagger-generated/accounts';
import axios, { AxiosResponse } from 'axios';
import { getAccessTokenFromClientCredentials } from '../services/token';
import { logger } from '../services/logger';
import { performance } from 'perf_hooks';
import { getEnv, getSecrets, createConfiguredClient } from '../app/config';

const formatExpirationDay = (date: Date, days: number) => {
  const result = new Date(date);
  result.setTime(result.getTime() + (days * 24 * 60 * 60 * 1000));
  return result;
};

/** Call the createAuthorization endpoint using client credentials. */
export const createAuthorizationId = async (authorizationInfo: any) => {

  const start1 = performance.now();
  const token = await getAccessTokenFromClientCredentials();
  const time1 = (performance.now() - start1).toFixed(0);
  logger.info(`${time1} ms Got access token from client credentials`);

  const env = getEnv();
  const authorizationApi = AccountsApi.AuthorizationApiFp();

  const accessToken = token.access_token;

  const accountRequest: AccountsApi.AccountRequest = {
    expires: authorizationInfo.authorizationDays
        ? formatExpirationDay(new Date (), authorizationInfo.authorizationDays)
        : undefined,
    transactionFrom: authorizationInfo.transactionFromDateTime,
    transactionTo: authorizationInfo.transactionToDateTime,
  };

  logger.debug(`createAuthorization ${JSON.stringify(accountRequest)}`);

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
    .then((response: AxiosResponse<AccountsApi.Authorization>) => response.data);

  const time2 = (performance.now() - start2).toFixed(0);
  logger.info(`authorizationId created in ${time2} ms`);
  return authorization.authorizationId;
};
