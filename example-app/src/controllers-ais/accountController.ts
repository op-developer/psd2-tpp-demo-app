import { Request, Response } from 'express';
import { toKeysAndValues, replaceAll } from '../services/utils';
import { performance } from 'perf_hooks';
import { getSessions, getSession, AuthorizationData, GlobalSessionData, AuthorizationType } from '../services/session';
import { Account, AisInterface } from '../models/accountInformation';
import { getEnv, isProdEnvironment } from '../app/config';

interface ErrorView {
  error: string;
  authorizationId?: string;
  authorizationIdLink?: string;
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
  authorizationIdLink?: string;
}

type ErrorOrAccountView = ErrorView | ExtendedAccountView;

export const getIntentUiLink = (authorizations: string) => {
    // tslint:disable-next-line:max-line-length
    return `https://intent-management-ui-${process.env.APP_ENVIRONMENT}.psd2.aws.op-palvelut.net/authorization/${authorizations}`;
};

export const getIntentUiLinkForAll = (req: Request) =>
  getIntentUiLink(getSessionauthorizationIds(req));

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
        // tslint:disable-next-line:max-line-length
        transactionsLink: `/accounts/transactions/${authorizationId}/${a.accountId}?account=${encodedStringifiedAccount}`,
      };
    });
};

const collectAllAccountsInfo = async (sessions: AuthorizationData[]): Promise<ErrorOrAccountView[]> =>
  Promise.all(sessions
    .filter((s) => s.authorizationType === AuthorizationType.OpPsd2Accounts)
    .map(async (session) => {
    try {
      return {
        authorizationId: session.authorizationId,
        authorizationIdLink: isProdEnvironment() ? undefined : getIntentUiLink(session.authorizationId as string),
        accountInfo: await collectAccountInfo(session.interface as AisInterface, session.authorizationId as string),
      };
    } catch (e) {
      return {
        authorizationId: session.authorizationId,
        authorizationIdLink: isProdEnvironment() ? undefined : getIntentUiLink(session.authorizationId as string),
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

const getSessionauthorizationIds = (req: Request) => {
    const s: GlobalSessionData = req.session as any;
    if (s.authorizations) {
        return s.authorizations.map((a) => a.authorizationId).join(',');
    }

    return '';
};

export const renderAccounts = async (req: Request, res: Response) => {
  const start1 = performance.now();
  const auths = await collectAllAccountsInfo(getSessions(req));
  res.render('accounts', {
    isLoggedIn: true,
    title: 'Accounts',
    tppName: getEnv().TPP_NAME,
    loadingTime: (performance.now() - start1).toFixed(0),
    intentLink: getIntentUiLinkForAll(req),
    linkToNextPage: '/accounts/authorize',
    auths,
    env: process.env.APP_ENVIRONMENT,
  });
};

export const renderAccount = async (req: Request, res: Response) => {
  const authorizationId = req.params.authorizationId;
  const accountId = req.params.accountId;
  const session = getSession(req, authorizationId);
  if (!session) {
    throw new Error('Missing session.');
  }
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
    // tslint:disable-next-line
    transactionsLink: `/accounts/transactions/${req.params.authorizationId}/${req.params.accountId}?account=${encodedStringifiedAccount}`,
    env: process.env.APP_ENVIRONMENT,
  });
};
