import { Request, Response } from 'express';
import { createInterface, createDummyInterface } from '../psd2/accountInformation';
import { AisInterface } from '../models/accountInformation';
import { TokenData, getAccessTokenFromRefreshToken } from '../services/token';
import { logger } from './logger';
import moment from 'moment';
import { getSecrets, getEnv } from '../app/config';

export interface AuthorizationData {
    interface?: AisInterface;
    tokens?: TokenData;
    authorizationId: string;
    oauthState?: string;
}

export interface GlobalSessionData {
    authorizations: AuthorizationData[];
}

const updateTokensIfNeeded = async (session: AuthorizationData, req: Request) => {
    if (session.tokens === undefined) {
        return session.tokens;
    }

    const expDate = moment(session.tokens.expirationDate);
    const currentDate = moment();
    if (currentDate.isAfter(expDate)) {
        logger.info(`Tokens expired at ${session.tokens.expirationDate}`);
        return getAccessTokenFromRefreshToken(session.tokens);
    }
    return session.tokens;
};

/** Remove any session data for authorizationId's where user did not complete the flow. */
const removeIncompleteAuthorizations = (req: Request) => {
    const s: GlobalSessionData = req.session as any;
    s.authorizations = s.authorizations.filter((a) => a.tokens !== undefined);
};

/** Middleware for requiring session. */
export const requireSession = (req: Request, res: Response, next: () => void) => {
    const sessions = getSessions(req);

    if (sessions.length === 0) {
        return res.status(500).render('error', {
            errorTitle: 'User not authorized',
            errorText: 'Session did not include access token',
            tppName: getEnv().TPP_NAME,
            env: process.env.APP_ENVIRONMENT,
        });
    }
    removeIncompleteAuthorizations(req);
    next();
};

export const createInterfacesToSession = async (req: Request, _: any, next: () => void) => {
    const sessions = getSessions(req);
    await Promise.all(sessions.map(async (session) => {
        session.tokens = await updateTokensIfNeeded(session, req);
        session.interface = session.tokens ?
            createInterface(session.tokens, getSecrets().API_KEY) :
            createDummyInterface();
    }));
    next();
};

export const getCurrentSession = (req: Request) => {
    const s: GlobalSessionData = req.session as any;
    if (s.authorizations === undefined) {
        throw Error('Missing session');
    }
    return s.authorizations[0];
};

export const getSessions = (req: Request) => {
    const s: GlobalSessionData = req.session as any;
    return s.authorizations || [];
};

export const getSession = (req: Request, authorizationId: string) => {
    const s: GlobalSessionData = req.session as any;
    const session = s.authorizations &&
        s.authorizations.find((a) => a.authorizationId === authorizationId);
    if (session === undefined) {
        throw Error('Missing session');
    }
    return session;
};
