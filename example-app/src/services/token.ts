import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import { logger } from './logger';
import moment from 'moment';
import { getEnv, getSecrets, createConfiguredClient } from '../app/config';

const createExpirationTimeStamp = (tokens: TokenData) => {
    const current = moment();
    // Add two minutes to refresh tokens a bit earlier
    const safetyBuffer = 2 * 60;
    const expirationInSeconds = moment.duration({ seconds: tokens.expires_in - safetyBuffer });
    return current.add(expirationInSeconds).toISOString();
};

/// The OAuth token information as returned from OIDC provider
export interface TokenData {
    access_token: string;
    refresh_token: string;
    scope: string;
    token_type: string;
    expires_in: number;
    id_token: string;
    error?: string;
    /// UTC time in ISO format
    expirationDate: string;
}

const getTokenHeaders = () => {
    return {
        'X-Request-Id': uuid(),
        'X-Session-Id': uuid(),
        'x-api-key':  getSecrets().API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
    };
};

const clientCredentials = () => {
    const clientId = getSecrets().TPP_CLIENT_ID;
    const clientSecret = getSecrets().TPP_CLIENT_SECRET;
    return `&client_id=${clientId}&client_secret=${clientSecret}`;
};

/// Request tokens and handle errors
export const getTokens = async (headers: { [key: string]: string }, body: string): Promise<TokenData> => {
    const env = getEnv();
    logger.info(`Request tokens from ${env.OIDC_ACCESS_TOKEN_URL} with body ${body}`);
    const response = await fetch(env.OIDC_ACCESS_TOKEN_URL, {
        agent: createConfiguredClient(),
        method: 'POST',
        body,
        headers,
    });

    if (response.ok) {
        const tokens: TokenData = await response.json();
        if (tokens.error !== undefined) {
            throw Error(tokens.error);
        }
        return tokens;
    } else {
        logger.error('Failed to fetch tokens');
        logger.debug(response.headers);
        logger.debug(`Failure data ${env.OIDC_ACCESS_TOKEN_URL} ${body}`);
        throw Error(await response.text());
    }
};

/// Fetch token for using client credentials grant
export const getAccessTokenFromClientCredentials = async (scope: string = 'accounts'): Promise<TokenData> => {
    // tslint:disable-next-line:max-line-length
    // https://openbanking.atlassian.net/wiki/spaces/DZ/pages/68550784/Open+Banking+Security+Profile+-+Implementer+s+Draft+v1.1.1
    // AISP obtains an Access Token using a Client Credentials Grant Type. The scope accounts must be used.
    const body = `grant_type=client_credentials&scope=${scope}${clientCredentials()}`;
    return getTokens(getTokenHeaders(), body);
};

/// Fetch token for specified user
export const getAccessTokenFromCode = async (code: string, redirectUri: string) => {
    const body = `grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}${clientCredentials()}`;
    const tokens = await getTokens(getTokenHeaders(), body);

    tokens.expirationDate = createExpirationTimeStamp(tokens);
    logger.info(`New tokens received. Expiration at ${tokens.expirationDate}`);
    logger.debug(tokens);
    return tokens;
};

export const getAccessTokenFromRefreshToken = async (oldTokens: TokenData): Promise<TokenData> => {
    const body = `grant_type=refresh_token&refresh_token=${oldTokens.refresh_token}${clientCredentials()}`;
    const newTokens = await getTokens(getTokenHeaders(), body);
    newTokens.expirationDate = createExpirationTimeStamp(newTokens);
    logger.info(`Tokens refreshed. Expiration at ${newTokens.expirationDate}`);
    logger.debug(newTokens);
    return newTokens.access_token ? newTokens : oldTokens;
};
