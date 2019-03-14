import { Request, Response } from 'express';
import { logger } from '../services/logger';
import { errToStr, toKeysAndValues, replaceAll } from '../services/utils';
import { performance } from 'perf_hooks';
import { getSessions, getSession, AuthorizationData } from '../services/session';
import { Account, AisInterface } from '../models/accountInformation';
import { getEnv } from '../app/config';

interface ErrorView {
  error: string;
}

interface AccountView extends Account {
  accountId: string;
  balanceLabel: string;
  iban: string;
  accountName: string;
}

interface ExtendedAccountView {
  accountInfo: AccountView[];
  authorizationId?: string;
  user: string;
}

type ToFront = ErrorView | ExtendedAccountView;

const collectAccountInfo = async (ais: AisInterface, authorizationId: string): Promise<AccountView[]> => {
  const accounts = await ais.getAccounts();
  return accounts
    .map((a) => {
      const account = {
        accountId: a.accountId,
        balanceLabel: renderBalance(a),
        iban: a.identifier,
        accountName: a.productName,
        ...a,
      };
      const stringified = JSON.stringify(account);
      const encodedStringifiedAccount = encodeURIComponent(stringified);
      return {
        ...account,
        stringified,
        transactionsLink:
          `/accounts/transactions/${authorizationId}/${a.accountId}?account=${encodedStringifiedAccount}`,
      };
    });
};

const collectAllAccountsInfo = async (sessions: AuthorizationData[]): Promise<ToFront[]> =>
  Promise.all(sessions.map(async (session) => {
    try {
      return {
        authorizationId: session.authorizationId,
        accountInfo: await collectAccountInfo(session.interface as AisInterface, session.authorizationId as string),
        user: session.authorizationId || 'Invalid authorizationId',
      };
    } catch (e) {
      return {
        error: e.message,
      };
    }
  }),
  );

export const renderBalance = (account: Account) => {
  if (account.balance === undefined) {
    return 'Unavailable';
  }

  if (parseFloat(account.balance) >= 0.0) {
    return `+${account.balance} ${account.currency}`;
  }
  return `${account.balance} ${account.currency}`;
};

export const renderAccounts = async (req: Request, res: Response) => {
  try {
    const start1 = performance.now();
    const auths = await collectAllAccountsInfo(getSessions(req));
    res.render('accounts', {
      isLoggedIn: true,
      title: 'Accounts',
      tppName: getEnv().TPP_NAME,
      loadingTime: (performance.now() - start1).toFixed(0),
      auths,
      env: process.env.APP_ENVIRONMENT,
    });
  } catch (err) {
    res.status(500).render('error', {
      errorTitle: 'There was an error in the application',
      errorText: errToStr(err),
      env: process.env.APP_ENVIRONMENT,
      tppName: getEnv().TPP_NAME,
    });
    logger.error(JSON.stringify(err));
  }
};

export const renderAccount = async (req: Request, res: Response) => {
  try {
    const authorizationId = req.params.authorizationId;
    const accountId = req.params.accountId;
    const session = getSession(req, authorizationId);
    if (!session.interface) {
      throw new Error('Missing interface.');
    }
    const psd2 = session.interface;
    const start1 = performance.now();
    const account = await psd2.getAccount(accountId);
    const encodedStringifiedAccount = encodeURIComponent(JSON.stringify(account));

    res.render('account-info', {
      isLoggedIn: true,
      title: 'Account info',
      tppName: getEnv().TPP_NAME,
      loadingTime: (performance.now() - start1).toFixed(0),
      account: toKeysAndValues(account).map((a) => ({name: a.name, value: replaceAll(a.value, '"', '')})),
      // tslint:disable-next-line: max-line-length
      transactionsLink: `/accounts/transactions/${req.params.authorizationId}/${req.params.accountId}?account=${encodedStringifiedAccount}`,
      env: process.env.APP_ENVIRONMENT,
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
