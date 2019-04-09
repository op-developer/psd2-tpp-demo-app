import { Request, Response } from 'express';
import { getEnv } from '../app/config';
import { performance } from 'perf_hooks';

export const beginAuthorize = (req: Request, res: Response) => {
  const start1 = performance.now();
  const today = new Date();
  const twoYearsAgo = new Date();
  twoYearsAgo.setDate(-700);
  res.render('begin-authorize-accounts', {
    title: 'Start account authorization',
    initialRangeStart: twoYearsAgo.toISOString().split('T')[0],
    initialRangeEnd: (today).toISOString().split('T')[0],
    tppName: getEnv().TPP_NAME,
    env: process.env.APP_ENVIRONMENT,
    loadingTime: (performance.now() - start1).toFixed(0),
  });
};
