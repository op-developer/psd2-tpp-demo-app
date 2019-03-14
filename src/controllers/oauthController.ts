import { Request, Response } from 'express';
import { logger } from '../services/logger';
import { errToStr } from '../services/utils';
import { getCurrentSession } from '../services/session';
import { getAccessTokenFromCode, TokenData } from '../services/token';
import { getEnv } from '../app/config';

export const getAccessToken = (req: Request, res: Response) => {
  logger.debug(`getAccessToken ${JSON.stringify(req.query)}`);
  const session = getCurrentSession(req);

  if (req.query.error !== undefined && req.query.error === 'access_denied') {
    session.tokens = undefined;
    return res.status(500).render('error', {
      errorTitle: 'Authentication error',
      errorText: req.query.error_description || 'There was a problem in authentication. Please contact support.',
      env: process.env.APP_ENVIRONMENT,
      tppName: getEnv().TPP_NAME,
    });
  }

  if (req.query.error !== undefined && req.query.error === 'server_error') {
    session.tokens = undefined;
    return res.status(500).render('error', {
      errorTitle: 'Authentication error',
      errorText: req.query.error_description || 'There was a problem in authentication. Please contact support.',
      env: process.env.APP_ENVIRONMENT,
      tppName: getEnv().TPP_NAME,
    });
  }

  // Extract OAuth callback parameters
  const code = req.query.code;
  const oauthState = req.query.state;

  // If we receive both code and id_token, the client needs to redirected user
  // See https://openid.net/specs/openid-connect-core-1_0.html#code-id_tokenExample
  if (code === undefined && oauthState === undefined && req.query.error === undefined) {
    logger.debug('Expecting id_token when code and oauthState are undefined');
    return res.render('oauth-redirect', {
      env: process.env.APP_ENVIRONMENT,
      tppName: getEnv().TPP_NAME,
    });
  }

  logger.info(`Verify OAuth state ${oauthState} to match ${session.oauthState}`);
  if (session.oauthState !== oauthState) {
    logger.error('OAuth states do not match');
    return res.status(500).render('error', {
      errorTitle: 'Authentication error',
      errorText: 'OAuth states do not match',
      env: process.env.APP_ENVIRONMENT,
      tppName: getEnv().TPP_NAME,
    });
  }

  session.oauthState = undefined;

  if (code === undefined) {
    session.tokens = undefined;
    return res.status(500).render('error', {
      errorTitle: 'Authentication error',
      errorText: 'Authentication flow cancelled',
      env: process.env.APP_ENVIRONMENT,
      tppName: getEnv().TPP_NAME,
    });
  }

  getAccessTokenFromCode(code, getEnv().TPP_OAUTH_CALLBACK_URL)
    .then((tokens) => {
      // Remove id_token, as otherwise the session cookie is too large.
      tokens.id_token = undefined;
      getCurrentSession(req).tokens = tokens;
      return getCurrentSession(req).tokens;
    })
    .then((tokens) => logger.debug(tokens as TokenData))
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
