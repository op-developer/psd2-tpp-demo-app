import { Request, Response } from 'express';
import { logErrorMessage } from '../services/utils';

/** Wraps the actual service call in an error handler.
 * Renders a generic error message if error happens.
 */
export const handleErrors = (handler: (req: Request, res: Response) => Promise<void | Response>) => {
  return (req: Request, res: Response) => {
    return handler(req, res).catch((err: Error) => {
      res.status(500).render('error', {
        errorTitle: 'There was an error in the application',
        errorText: logErrorMessage(err),
        env: process.env.APP_ENVIRONMENT,
      });
    });
  };
};
