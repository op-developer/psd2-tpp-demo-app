import { Request, Response } from 'express';
import { getEnv } from '../app/config';
import { logger } from '../services/logger';
import { handleErrorResponse } from './paymentUtils';
import { collectAuthorizations } from './payments';

export const listAuthorizedPayments = async (req: Request, res: Response): Promise<void> => {
    logger.info('Listing authorized payments');

    const authorizations = await collectAuthorizations(req);
    try {
        res.render('payments', {
            title: 'Authorized Payments',
            tppName: getEnv().TPP_NAME,
            env: process.env.APP_ENVIRONMENT,
            linkToNextPage: '/payments/select-type',
            authorizations,
        });
    } catch (err) {
        handleErrorResponse(err, res);
    }
};
