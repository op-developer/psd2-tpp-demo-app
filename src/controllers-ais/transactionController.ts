import { Request, Response } from 'express';
import { logger } from '../services/logger';
import { errToStr, toKeysAndValues } from '../services/utils';
import { performance } from 'perf_hooks';
import { getSession } from '../services/session';
import { getEnv } from '../app/config';
import { renderBalance } from './accountController';

export const renderTransaction = async (req: Request, res: Response) => {
  if (req.params.accountId === undefined) {
    return res.status(500).send();
  }
  try {
    const authorizationId = req.params.authorizationId;
    const transaction = JSON.parse(req.query.transaction);
    const encodedStringifiedAccount = encodeURIComponent(req.query.account);
    const start1 = performance.now();

    return res.render('transaction', {
      isLoggedIn: true,
      title: 'Transaction information',
      tppName: getEnv().TPP_NAME,
      transaction: toKeysAndValues(transaction),
      // tslint:disable-next-line: max-line-length
      transactionsLink: `/accounts/transactions/${authorizationId}/${req.params.accountId}?account=${encodedStringifiedAccount}`,
      loadingTime: (performance.now() - start1).toFixed(0),
      env: process.env.APP_ENVIRONMENT,
      user: authorizationId,
    });
  } catch (err) {
    res.status(500).render('error', {
      errorTitle: 'There was an error in the application',
      errorText: errToStr(err),
      env: process.env.APP_ENVIRONMENT,
    });
    logger.error(JSON.stringify(err));
  }
};

export const renderTransactions = async (req: Request, res: Response) => {
  if (req.params.accountId === undefined) {
    return res.status(500).send();
  }
  try {
    const authorizationId = req.params.authorizationId;
    const accountId = req.params.accountId;
    const session = getSession(req, authorizationId);
    const continuationToken = req.query.continuationToken;
    const showAllTransactions = req.query.showAllTransactions;
    const stringifiedAccount = req.query.account;
    const account = JSON.parse(stringifiedAccount);
    const encodedStringifiedAccount = encodeURIComponent(stringifiedAccount);

    if (!session.interface) {
      throw new Error('Missing interface.');
    }
    const psd2 = session.interface;
    const start1 = performance.now();

    let transactions = new Array();
    let newContinuationToken;
    if (showAllTransactions) {
      transactions = await psd2.getAllTransactions(accountId);
    } else {
      const transactionPage = await psd2.getTransactionPage(accountId, continuationToken);
      if (transactionPage.transactions) {
        transactions = transactionPage.transactions;
      }
      newContinuationToken = transactionPage.continuationToken;
    }

    transactions = transactions.map((tr) => {
      const stringified = JSON.stringify(tr);
      const { date, ...rest } = tr;
      return {
        ...rest,
        // tslint:disable-next-line: max-line-length
        transactionLink: `/accounts/transaction/${authorizationId}/${accountId}?account=${encodedStringifiedAccount}&transaction=${encodeURIComponent(stringified)}`,
        stringified,
        date: date ? date.toLocaleDateString() : undefined,
      };
    });

    const balanceLabel = renderBalance(account);

    return res.render('transactions', {
      isLoggedIn: true,
      title: 'Transactions',
      iban: account.identifier,
      tppName: getEnv().TPP_NAME,
      hasTransactions: transactions.length > 0,
      transactions,
      balanceLabel,
      loadingTime: (performance.now() - start1).toFixed(0),
      env: process.env.APP_ENVIRONMENT,
      accountLink: `/accounts/${authorizationId}/${req.params.accountId}`,
      nextPageLink: newContinuationToken
      // tslint:disable-next-line: max-line-length
      ? `/accounts/transactions/${authorizationId}/${accountId}?continuationToken=${newContinuationToken}&account=${encodedStringifiedAccount}`
      : undefined,
      allTransactionsLink: showAllTransactions || !newContinuationToken
      ? undefined
      // tslint:disable-next-line: max-line-length
      : `/accounts/transactions/${authorizationId}/${accountId}?showAllTransactions=true&account=${encodedStringifiedAccount}`,
      user: await authorizationId,
    });
  } catch (err) {
    res.status(500).render('error', {
      errorTitle: 'There was an error in the application',
      errorText: errToStr(err),
      env: process.env.APP_ENVIRONMENT,
    });
    logger.error(JSON.stringify(err));
  }
};
