import { Request, Response } from 'express';
import { logger } from './logger';
import { getCurrentSession, AuthorizationData } from './session';
import { getEnv, getSecrets } from '../app/config';
import crypto from 'crypto';
import base64url from 'base64url';
import { TokenData } from './token';
import * as jwt from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';

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

export const verifyIdTokenAndStoreTokensToSession = async (
    tokens: TokenData, session: AuthorizationData) => {

    const jwksUri = getEnv().OIDC_JWKS_URL;
    await verifyIdToken(tokens.id_token, jwksUri, undefined, tokens.access_token, tokens.refresh_token);
    // Skip unneeded id_token to save space in the session cookie
    session.tokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        expirationDate: tokens.expirationDate,
    };
};

export const verifyIdToken = (idToken: string, jwksUri: string,
                              nonce?: string, accessToken?: string, refreshToken?: string,
                              code?: string, state?: string, ignoreExpiration?: boolean): Promise<IdToken> =>
    new Promise((resolve, reject) => {
        logger.info('Going to verify id_token');

        const options: jwt.VerifyOptions = {
            algorithms: ['RS256'],
            issuer: getExpectedIssuer(),
            audience: getSecrets().TPP_CLIENT_ID,
            ignoreExpiration,
        };
        const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
            const client = JwksRsa({jwksUri});
            client.getSigningKey(header.kid || '', (_, key: JwksRsa.SigningKey) => {
                if (key !== undefined) {
                    const signingKey = (key as JwksRsa.RsaSigningKey).rsaPublicKey;
                    callback(undefined, signingKey);
                } else {
                    callback(new Error(`Could not get the signing key from ${jwksUri}`));
                }
            });
        };
        jwt.verify(idToken, getKey, options, (err: jwt.VerifyErrors, decoded: string | object) => {
            if (err !== null) {
                return reject(err);
            }

            const payload = decoded as any;
            if (nonce !== undefined && payload.nonce !== nonce) {
                reject(new Error('Nonce does not match.'));
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
            const jwksUri = getEnv().OIDC_JWKS_URL;
            const decoded = await verifyIdToken(req.query.id_token, jwksUri,
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
