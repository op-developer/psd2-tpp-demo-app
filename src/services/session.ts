import { Request, Response } from 'express';
import { createInterface, createDummyInterface } from '../controllers-ais/accountInformation';
import { AisInterface } from '../models/accountInformation';
import { getAccessTokenFromRefreshToken, TokenData } from '../services/token';
import { logger } from './logger';
import moment from 'moment';
import { getSecrets, getEnv } from '../app/config';

/// The OAuth token information in session
export interface SessionTokenData {
    access_token: string;
    refresh_token: string;
    scope: string;
    token_type: string;
    expires_in: number;
    /// UTC time in ISO format
    expirationDate: string;
}

export enum AuthorizationType {
    Undefined,
    OpPsd2Accounts,
}

export interface AuthorizationData {
    interface?: AisInterface;
    authorizationType: AuthorizationType;
    tokens?: SessionTokenData;
    authorizationId?: string;
    cofIban?: string;
    // The OAuth state during authorization
    oauthState?: string;
    // The nonce during authorization
    nonce?: string;
}

export interface GlobalSessionData {
    authorizations: AuthorizationData[];
}

export const EmptyAuthorization: AuthorizationData = {
    authorizationType: AuthorizationType.Undefined,
    interface: undefined,
    tokens: undefined,
    authorizationId: undefined,
    oauthState: undefined,
};

const updateTokensIfNeeded = async (session: AuthorizationData, req: Request) => {
    if (session.tokens === undefined) {
        return session.tokens;
    }

    const expDate = moment(session.tokens.expirationDate);
    const currentDate = moment();
    if (currentDate.isAfter(expDate)) {
        logger.info(`Tokens expired at ${session.tokens.expirationDate}`);
        const oldTokens: TokenData = {
            id_token: '',
            ...session.tokens,
        };
        return getAccessTokenFromRefreshToken(oldTokens);
    }
    return session.tokens;
};

/** Remove any session data for authorizationId's where user did not complete the flow. */
const removeIncompleteAuthorizations = (req: Request) => {
    const s: GlobalSessionData = req.session as any;
    s.authorizations = s.authorizations.filter((a) => a.tokens !== undefined);
};

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

/** Initializes the sessions. */
export const createInterfacesToSessions = async (req: Request, _: any, next: () => void) => {
    const createInterfaceToSession = async (session: AuthorizationData) => {
        session.tokens = await updateTokensIfNeeded(session, req);
        session.interface = session.tokens && session.authorizationType === AuthorizationType.OpPsd2Accounts ?
            createInterface(session.tokens, getSecrets().API_KEY) :
            createDummyInterface();
    };
    await Promise.all(getSessions(req).map(createInterfaceToSession));
    next();
};

export const getCurrentSession = (req: Request) => {
    const s: GlobalSessionData = req.session as any;
    return s.authorizations ? s.authorizations[0] : EmptyAuthorization;
};

export const getSessions = (req: Request) => {
    const s: GlobalSessionData = req.session as any;
    return s.authorizations || [];
};

export const getSession = (req: Request, authorizationId: string) => {
    const s: GlobalSessionData = req.session as any;
    return s.authorizations ?
        s.authorizations.find((a) => a.authorizationId === authorizationId) :
        EmptyAuthorization;
};
