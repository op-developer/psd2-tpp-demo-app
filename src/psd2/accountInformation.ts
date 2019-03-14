import * as AccountsApi from '../swagger-generated/accounts';
import axios, { AxiosResponse } from 'axios';
import { logger } from '../services/logger';
import {
  IdentifierScheme,
  AisInterface,
  Transaction,
  Currency,
  Account,
} from '../models/accountInformation';
import { TokenData } from '../services/token';
import { getEnv, createConfiguredClient } from '../app/config';

const getTransactionLabel = (transaction: AccountsApi.Transaction) => {
  if (transaction.recipient && transaction.recipient.name && transaction.recipient.name.length > 0) {
    return transaction.recipient.name;
  }

  if (transaction.payer && transaction.payer.name && transaction.payer.name.length > 0) {
    return transaction.payer.name;
  }

  return transaction.proprietaryTransactionDescription;
};
const mapAccountToGeneric = (account: AccountsApi.Account): Account => {
  return {
    accountId: account.accountId,
    currency: Currency.Euro,
    productName: account.productName,
    identifier: account.identifier,
    identifierScheme: IdentifierScheme.Iban,
    balance: account.netBalance,
  };
};

const mapTransactionToGeneric = (transaction: AccountsApi.Transaction): Transaction => {
  return {
    transactionId: transaction.archiveId,
    date: transaction.valueDate ? new Date(transaction.valueDate) : undefined,
    amount: transaction.amount,
    label: getTransactionLabel(transaction),
    proprietaryTransactionCode: transaction.proprietaryTransactionDescription,
    recipient: transaction.recipient && transaction.recipient.name,
    payer: transaction.payer && transaction.payer.name,
    info: transaction.message,
  };
};

export const createDummyInterface = () => {
  return {
    getAccounts() {
      throw Error('User not authenticated');
    },
    getAccount(_: string) {
      throw Error('User not authenticated');
    },
    getAllTransactions(_: string) {
      throw Error('User not authenticated');
    },
    getTransactionPage(_: string) {
      throw Error('User not authenticated');
    },
  };
};

export const createInterface = (tokens: TokenData, apiKey: string): AisInterface => {
  const env = getEnv();
  const accountsApi = AccountsApi.AccountsApiFp();
  const httpsAgent = createConfiguredClient();

  const getTransactionPageHelper = async (
    accountId: string,
    continuationToken?: string,
  ) => {
    const page = await accountsApi.getAccountTransactions(
      accountId,
      apiKey,
      undefined,
      undefined,
      undefined,
      undefined,
      `Bearer ${tokens.access_token}`,
      continuationToken,
    )(axios.create({ httpsAgent }), env.PSD2_AIS_API_URL)
      .then((response: AxiosResponse<AccountsApi.TransactionsResponse>) => {
        return response.data;
      });

    logger.debug(`Got new continuationToken: ${page.continuationToken}`);

    return {
      transactions: page.transactions,
      continuationToken: page.continuationToken,
    };
  };

  const getAllTransactionsRecursively = async (
    accountId: string,
    accumulatedTransactions: Transaction[],
    continuationToken?: string,
  ): Promise<Transaction[]> => {
    const page = await getTransactionPageHelper(accountId, continuationToken);
    const newAccumulatedTransactions = accumulatedTransactions.concat(page.transactions as ConcatArray<Transaction>);

    if (page.continuationToken) {
      return getAllTransactionsRecursively(
        accountId,
        newAccumulatedTransactions,
        page.continuationToken,
      );
    }
    return newAccumulatedTransactions;
  };

  return {
    async getAccount(accountId: string) {
      const account = await accountsApi.getAccount(
        accountId,
        apiKey,
        undefined,
        undefined,
        undefined,
        undefined,
        `Bearer ${tokens.access_token}`,
      )(axios.create({ httpsAgent }), env.PSD2_AIS_API_URL)
        .then((response: AxiosResponse<AccountsApi.Account>) => response.data);
      return mapAccountToGeneric(account);
    },
    async getAccounts() {
      const accounts = await accountsApi.listAccounts(
        apiKey,
        undefined,
        undefined,
        undefined,
        undefined,
        `Bearer ${tokens.access_token}`,
      )(axios.create({ httpsAgent }), env.PSD2_AIS_API_URL)
        .then((response: AxiosResponse<AccountsApi.Account[]>) => response.data);
      return accounts.map(mapAccountToGeneric);
    },
    async getTransactionPage(accountId: string, continuationToken?: string) {
      logger.debug(`Asking new page of account transactions with: ${continuationToken}`);
      const transactionPage = await getTransactionPageHelper(accountId, continuationToken);
      return {
        transactions: transactionPage.transactions
        ? transactionPage.transactions.map(mapTransactionToGeneric)
        : [],
        continuationToken: transactionPage.continuationToken,
      };
    },
    async getAllTransactions(accountId: string) {
      return getAllTransactionsRecursively(accountId, []);
    },
  };
};
