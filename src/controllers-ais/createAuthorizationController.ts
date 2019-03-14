import { Request, Response } from 'express';
import { errToStr } from '../services/utils';
import { logger } from '../services/logger';
import { createClaimsQuery } from '../services/jwt';
import * as queryString from 'query-string';
import { GlobalSessionData, AuthorizationData } from '../services/session';
import { createAuthorizationId } from '../psd2/createAuthorizationRequest';
import { getEnv, getSecrets } from '../app/config';
import { randomBytes } from 'crypto';

// Redirect URI to redirect user to the OIDC provider authorization endpoint
const createOidcRedirectUri = (authorizationId: string,
                               oauthState: string) => {
  const env = getEnv();
  const nonce = randomBytes(12).toString('hex');
  const scope = 'openid accounts';
  const clientId = getSecrets().TPP_CLIENT_ID;
  const params = {
    request: createClaimsQuery(authorizationId, oauthState, scope, nonce,
      clientId, env.TPP_OAUTH_CALLBACK_URL),
    response_type: 'code id_token',
    client_id: clientId,
    scope,
    state: oauthState,
    nonce,
    redirect_uri: env.TPP_OAUTH_CALLBACK_URL,
  };
  const redirectUrl = env.OIDC_REDIRECT_URL + '?' + queryString.stringify(params);
  logger.debug(redirectUrl);
  return redirectUrl;
};

const updateSession = (authorizationId: string, req: Request, res: Response) => {
  logger.info(`Store authorizationId ${authorizationId} to session`);
  const sessionData: GlobalSessionData = req.session as any;

  const oauthState = randomBytes(12).toString('hex');
  const auth: AuthorizationData = {
    interface: undefined,
    tokens: undefined,
    authorizationId,
    oauthState,
  };
  const sessions: AuthorizationData[] = sessionData.authorizations || [];
  sessionData.authorizations = [auth, ...sessions];
  return res.redirect(createOidcRedirectUri(auth.authorizationId, oauthState));
};

export const postCreateAuthorization = (req: Request, res: Response) => {
  logger.debug(req.body);

  const permissions = req.body.TransactionRange === 'on' ? {
    transactionFromDateTime: req.body.TransactionRangeFrom,
    transactionToDateTime: req.body.TransactionRangeTo,
  } : {
    authorizationDays: parseInt(req.body.authorizationDays, 10),
  };

  logger.info(`Requesting permissions ${JSON.stringify(permissions, undefined, 2)}`);
  createAuthorizationId(permissions)
    .then((authorizationId) => updateSession(authorizationId, req, res))
    .catch((err) => {
      logger.error(err.message);
      res.status(500).render('error', {
        errorTitle: 'There was an error in the application',
        errorText: errToStr(err),
        tppName: getEnv().TPP_NAME,
        env: process.env.APP_ENVIRONMENT,
      });
  });
};
