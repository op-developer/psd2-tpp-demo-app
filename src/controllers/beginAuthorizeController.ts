import { Request, Response } from 'express';
import { getEnv } from '../app/config';
import { performance } from 'perf_hooks';

export const beginAuthorize = (req: Request, res: Response) => {
    const start1 = performance.now();
    res.render('begin-authorize', {
        title: 'Start authorization',
        tppName: getEnv().TPP_NAME,
        env: process.env.APP_ENVIRONMENT,
        loadingTime: (performance.now() - start1).toFixed(0),
    });
};

export const selectBank = (req: Request, res: Response) => {
    const start1 = performance.now();
    res.render('select-bank', {
        title: 'Select bank',
        tppName: getEnv().TPP_NAME,
        env: process.env.APP_ENVIRONMENT,
        loadingTime: (performance.now() - start1).toFixed(0),
    });
};
