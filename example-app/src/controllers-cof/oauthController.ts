import { Request, Response } from 'express';
import { logErrorMessage } from '../services/utils';
import { getCurrentSession } from '../services/session';
import { getAccessTokenFromCode } from '../services/token';
import { getEnv } from '../app/config';
import { fetchCofAuthorizationIbanToSession } from './cofController';
import { verifyIdTokenAndStoreTokensToSession } from '../services/oauthHandler';

export const getAccessToken = (req: Request, res: Response) => {
  const code = req.query.code;
  const env = getEnv();
  const session = getCurrentSession(req);

  getAccessTokenFromCode(code, env.TPP_OAUTH_CALLBACK_URL_CONFIRMATION_OF_FUNDS)
  .then((tokens) =>
    verifyIdTokenAndStoreTokensToSession(tokens, session))
  .then(() => fetchCofAuthorizationIbanToSession(req))
  .then(() => res.redirect('/cof'))
  .catch((err) => {
      res.status(500).render('error', {
        errorTitle: 'There was an error in the application',
        errorText: logErrorMessage(err),
        env: process.env.APP_ENVIRONMENT,
        tppName: getEnv().TPP_NAME,
      });
    });
};
