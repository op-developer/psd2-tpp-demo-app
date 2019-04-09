import { Request, Response } from 'express';
import { logger } from '../services/logger';
import { errToStr } from '../services/utils';
import { getCurrentSession } from '../services/session';
import { getAccessTokenFromCode } from '../services/token';
import { getEnv } from '../app/config';
import { verifyIdToken } from '../services/oauthHandler';

export const getAccessToken = (req: Request, res: Response) => {
  const code = req.query.code;
  const env = getEnv();
  const session = getCurrentSession(req);

  getAccessTokenFromCode(code, env.TPP_OAUTH_CALLBACK_URL_ACCOUNTS)
    .then(async (tokens) => {
      await verifyIdToken(tokens.id_token, undefined, tokens.access_token, tokens.refresh_token);
      session.tokens = tokens;
    })
    .then(() => res.redirect('/accounts'))
    .catch((err) => {
      res.status(500).render('error', {
        errorTitle: 'There was an error in the application',
        errorText: errToStr(err),
        env: process.env.APP_ENVIRONMENT,
        tppName: getEnv().TPP_NAME,
      });
      logger.error(JSON.stringify(err));
    });
};
