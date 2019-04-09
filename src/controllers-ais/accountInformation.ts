import * as accounts from '../swagger-generated/accounts';
import axios, { AxiosResponse } from 'axios';
import { logger } from '../services/logger';
import {
  IdentifierScheme,
  AisInterface,
  Transaction,
  Currency,
  CardTransaction,
  Account,
} from '../models/accountInformation';
import { getEnv, createConfiguredClient } from '../app/config';
import { SessionTokenData } from '../services/session';

const getTransactionLabel = (transaction: accounts.Transaction) => {
  if (transaction.recipient && transaction.recipient.name && transaction.recipient.name.length > 0) {
    return transaction.recipient.name;
  }

  if (transaction.payer && transaction.payer.name && transaction.payer.name.length > 0) {
    return transaction.payer.name;
  }

  return transaction.proprietaryTransactionDescription;
};
const mapAccountToGeneric = (account: accounts.Account): Account => {
  return {
    accountId: account.accountId,
    currency: Currency.Euro,
    productName: account.productName,
    identifier: account.identifier,
    identifierScheme: IdentifierScheme.Iban,
    balance: account.netBalance,
  };
};

const mapCardTransactionToGeneric = (transaction: accounts.CardTransaction): CardTransaction => {
  return {
    description: transaction.description,
    amount: transaction.amount,
    currency: Currency.Euro,
    postingDate: transaction.postingDate,
  };
};

const mapTransactionToGeneric = (transaction: accounts.Transaction): Transaction => {
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
    getAllCardTransactions(_: string) {
      throw Error('User not authenticated');
    },
    getCardTransactionPage(_: string) {
      throw Error('User not authenticated');
    },
    getCards() {
      throw Error('User not authenticated');
    },
  };
};

export const createInterface = (tokens: SessionTokenData, apiKey: string): AisInterface => {
  const env = getEnv();
  const accountsApi = accounts.AccountsApiFp();
  const cardsApi = accounts.CardsApiFp();
  const httpsAgent = createConfiguredClient();

  const getTransactionPageHelper = async (
    accountId: string,
    continuationToken?: string,
  ) => {
    logger.debug(`Asking new page of account transactions with: ${continuationToken}`);
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
      .then((response: AxiosResponse<accounts.TransactionsResponse>) => {
        return response.data;
      });

    logger.debug(`Got new continuationToken: ${page.continuationToken}`);

    return {
      transactions: page.transactions,
      continuationToken: page.continuationToken,
    };
  };

  const getCardTransactionPageHelper = async (
    cardId: string,
    continuationToken?: string,
  ) => {
    logger.debug(`Asking new page of card transactions with: ${continuationToken}`);
    const page = await cardsApi.getCardTransactions(
      cardId,
      apiKey,
      undefined,
      undefined,
      undefined,
      undefined,
      `Bearer ${tokens.access_token}`,
      continuationToken,
    )(axios.create({ httpsAgent }), env.PSD2_AIS_API_URL)
      .then((response: AxiosResponse<accounts.CardTransactionsResponse>) => {
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

  const getAllCardTransactionsRecursively = async (
    cardId: string,
    accumulatedTransactions: CardTransaction[],
    continuationToken?: string,
  ): Promise<CardTransaction[]> => {
    const page = await getCardTransactionPageHelper(cardId, continuationToken);
    const newAccumulatedTransactions = accumulatedTransactions
      .concat(page.transactions as ConcatArray<CardTransaction>);

    if (page.continuationToken) {
      return getAllCardTransactionsRecursively(
        cardId,
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
        .then((response: AxiosResponse<accounts.Account>) => response.data);
      return mapAccountToGeneric(account);
    },
    async getAccounts() {
      const accountsList = await accountsApi.listAccounts(
        apiKey,
        undefined,
        undefined,
        undefined,
        undefined,
        `Bearer ${tokens.access_token}`,
      )(axios.create({ httpsAgent }), env.PSD2_AIS_API_URL)
        .then((response: AxiosResponse<accounts.Account[]>) => response.data);
      return accountsList.map(mapAccountToGeneric);
    },
    async getTransactionPage(accountId: string, continuationToken?: string) {
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
    async getCards() {
      const cards = await cardsApi.listCards(
        apiKey,
        undefined,
        undefined,
        undefined,
        undefined,
        `Bearer ${tokens.access_token}`,
      )(axios.create({ httpsAgent }), env.PSD2_AIS_API_URL)
        .then((response: AxiosResponse<accounts.Card[]>) => response.data);
      return cards.map((card: accounts.Card) => {
        return {
          cardId: card.cardId,
          productName: card.productName,
          cardNumber: card.cardNumber,
        };
      });
    },
    async getAllCardTransactions(cardId: string) {
      return getAllCardTransactionsRecursively(cardId, []);
    },
    async getCardTransactionPage(cardId: string, continuationToken?: string) {
      const cardTransactionPage = await getCardTransactionPageHelper(cardId, continuationToken);
      return {
        transactions: cardTransactionPage.transactions
        ? cardTransactionPage.transactions.map(mapCardTransactionToGeneric)
        : [],
        continuationToken: cardTransactionPage.continuationToken,
      };
    },
  };
};
