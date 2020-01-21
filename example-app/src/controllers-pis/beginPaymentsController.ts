import { Request, Response } from 'express';
import { getEnv } from '../app/config';
import { logger } from '../services/logger';
import { getLatestAccessToken } from '../services/session';

export const beginAuthorize = (req: Request, res: Response) => {
    logger.info('begin authorize');
    const tokens = getLatestAccessToken(req);
    if (tokens) {
        res.render('begin-authorize-payment', {
            title: 'Start payment authorization',
            tppName: getEnv().TPP_NAME,
            env: process.env.APP_ENVIRONMENT,
            accessToken: tokens.access_token,
            expirationDate: tokens.expirationDate,
        });
    }
    else {
        res.render('begin-authorize-payment', {
            title: 'Start payment authorization',
            tppName: getEnv().TPP_NAME,
            env: process.env.APP_ENVIRONMENT,
        });
    }
};

export const selectPaymentType = (req: Request, res: Response) => {
    res.render('select-payment-type', {
        title: 'Select payment type',
        tppName: getEnv().TPP_NAME,
        env: process.env.APP_ENVIRONMENT,
    });
};

export const beginAuthorizeForeign = (req: Request, res: Response) => {
    res.render('begin-authorize-foreign-payment', {
        title: 'Start foreign payment authorization',
        tppName: getEnv().TPP_NAME,
        env: process.env.APP_ENVIRONMENT,
    });
};
