import { Request, Response } from 'express';
import { logger } from './logger';
import { getCurrentSession } from './session';
import { getEnv, getSecrets } from '../app/config';
import crypto from 'crypto';
import base64url from 'base64url';

// tslint:disable-next-line:no-var-requires
const IdTokenVerifier = require('idtoken-verifier');

interface IdToken {
    'nonce': string;
    'authorizationId': string;
    'iat': number;
    'iss': string;
    'sub': string;
    'exp': number;
    'acr': string;
    'aud': string;
    'c_hash'?: string;
    's_hash'?: string;
    'rt_hash'?: string;
    'at_hash'?: string;
}

const getExpectedIssuer = () => {
    const redirectUri = getEnv().OIDC_REDIRECT_URL;
    return redirectUri.substr(0, redirectUri.indexOf('/', 'https://'.length));
};

/**
 * https://openid.net/specs/openid-connect-core-1_0.html#HybridIDToken
 * Its value is the base64url encoding of the left-most half of the hash
 * of the octets of the ASCII representation of the code value, where the
 * hash algorithm used is the hash algorithm used in the alg Header Parameter
 * of the ID Token's JOSE Header. For instance, if the alg is HS512, hash
 * the code value with SHA-512, then take the left-most 256 bits and base64url
 * encode them.
 */
export const verifyHash = (expectedHash: string, value?: string) => {
  const valueHashed = crypto.createHash('sha256').update(value || '').digest();
  const base64Hash = base64url(valueHashed.slice(0, valueHashed.length / 2));

  if (base64Hash !== expectedHash) {
    throw Error(`${base64Hash} does not equal ${expectedHash}`);
  }
};

export const verifyIdToken = (idToken: string, nonce?: string, accessToken?: string, refreshToken?: string,
                              code?: string, state?: string): Promise<IdToken> =>
    new Promise((resolve, reject) => {
        const verifier = new IdTokenVerifier({
            issuer: getExpectedIssuer(),
            audience: getSecrets().TPP_CLIENT_ID,
            jwksURI: getEnv().OIDC_JWKS_URL,
        });

        logger.info('Going to verify id_token');

        // The library checks the nonce against null, not undefined
        // tslint:disable-next-line:no-null-keyword
        const maybeNonce = nonce === undefined ? null : nonce;
        verifier.verify(idToken, maybeNonce, (error: any, payload: IdToken) => {
            if (error !== null) {
                return reject(error);
            }
            try {
                // Depending on the contents verify either code and state or
                // access token and refresh token
                if (payload.c_hash && payload.s_hash) {
                    verifyHash(payload.c_hash, code);
                    verifyHash(payload.s_hash, state);
                }

                if (payload.at_hash && payload.rt_hash) {
                    verifyHash(payload.at_hash, accessToken);
                    verifyHash(payload.rt_hash, refreshToken);
                }
            } catch (err) {
                return reject(err);
            }
            logger.info('Token verified');
            resolve(payload);
        });
    });

const renderError = (res: Response, title: string, text: string) =>
    res.status(500).render('error', {
        errorTitle: title,
        errorText: text || 'There was a problem in authentication. Please contact support.',
        env: process.env.APP_ENVIRONMENT,
        tppName: getEnv().TPP_NAME,
    });

/** Handle common OAuth cases before calling the specific OAuth handler. */
export const verifyOauthSession = async (req: Request, res: Response, next: () => void) => {
    logger.debug(`verifyOauthSession ${JSON.stringify(req.query)}`);
    const session = getCurrentSession(req);

    // Fail with OAuth error
    if (req.query.error !== undefined) {
        session.tokens = undefined;
        // Known errors
        const title = (req.query.error === 'access_denied' || req.query.error === 'server_error') ?
            'Authentication error' : 'Unknown error';
        return renderError(res, title, req.query.error_description);
    }

    const code = req.query.code;
    const oauthState = req.query.state;

    if (code === undefined && oauthState === undefined) {
        return res.render('oauth-redirect');
    }

    logger.info(`Verify OAuth state ${oauthState} to match ${session.oauthState}`);
    if (session.oauthState !== oauthState) {
        session.tokens = undefined;
        return renderError(res, 'Authentication error', 'OAuth states do not match');
    }

    try {
        if (req.query.id_token) {
            const decoded = await verifyIdToken(req.query.id_token,
                session.nonce, undefined, undefined, code, session.oauthState);
            logger.debug(decoded);
        } else {
            logger.info('There was no id_token in the query');
        }
    } catch (err) {
        const e: Error = err;
        session.tokens = undefined;
        return renderError(res, 'Authentication error', e.message);
    }

    session.oauthState = undefined;
    if (code === undefined) {
        session.tokens = undefined;
        return renderError(res, 'Authentication error', 'Authentication flow cancelled');
    }
    next();
};
