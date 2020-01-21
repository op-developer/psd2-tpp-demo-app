import { Request, Response } from 'express';
import { getEnv } from '../app/config';
import { logger } from '../services/logger';
import { handleErrorResponse } from './paymentUtils';
import { getSessions } from '../services/session';
import { submitSepaPayment } from './payments';
import { listAuthorizedPayments } from './listAuthorizedController';

export const submitAuthorizedPayments = async (req: Request, res: Response): Promise<void> => {
    try {
        const authorizedPayments = req.body.selectedPayment;
        const authorizationId = req.body.authorizationId;
        if (authorizedPayments && authorizedPayments.length > 0) {
            await handlePaymentSubmissionsAndReturnView(
                authorizedPayments,
                authorizationId,
                req,
                res,
            );
        } else {
            res.status(500).render('payment-error', {
                errorTitle: 'There was an error in the application',
                errorText: 'Operation is not supported, no payments to authorize',
                tppName: getEnv().TPP_NAME,
                env: process.env.APP_ENVIRONMENT,
            });
        }
    } catch (err) {
        handleErrorResponse(err, res);
    }
};

const handlePaymentSubmissionsAndReturnView = async (payments: string[],
                                                     authorizationId: string | undefined,
                                                     req: Request,
                                                     res: Response): Promise<void> => {

    const authorizations = getSessions(req).filter((curAuth) => curAuth.authorizationId === authorizationId);
    const tokens = authorizations.length > 0 ? authorizations[0].tokens : undefined;
    const authorizationToken = tokens ? tokens.access_token : '';

    const submissionsResults = await Promise.all(
        payments.map((payment) => submitSepaPayment(authorizationToken, payment)),
    );
    logger.debug(submissionsResults);

    await listAuthorizedPayments(req, res);
};
