import { Request, Response } from 'express';
import { getSession, getSessions, AuthorizationType, AuthorizationData } from '../services/session';
import { toKeysAndValues, replaceAll } from '../services/utils';
import { getEnv } from '../app/config';
import { AisInterface, CardTransaction } from '../models/accountInformation';
import { performance } from 'perf_hooks';
import { logger } from '../services/logger';

export const renderCard = async (req: Request, res: Response) => {
  const authorizationId = req.params.authorizationId;
  const cardId = req.params.cardId;
  const card = JSON.parse(req.query.card);
  const start1 = performance.now();
  res.render('card', {
    isLoggedIn: true,
    title: 'Card Information',
    cardNumber: card.cardNumber,
    card: toKeysAndValues(card).map((c) => ({name: c.name, value: replaceAll(c.value, '"', '')})),
    transactionsLink: `/cards/transactions/${authorizationId}/${cardId}?card=${encodeURIComponent(req.query.card)}`,
    tppName: getEnv().TPP_NAME,
    loadingTime: (performance.now() - start1).toFixed(0),
    env: process.env.APP_ENVIRONMENT,
  });
};

export const renderCardTransaction = async (req: Request, res: Response) => {
  const authorizationId = req.params.authorizationId;
  const cardId = req.params.cardId;
  const transaction = JSON.parse(req.query.transaction);
  const start1 = performance.now();
  res.render('transaction', {
    isLoggedIn: true,
    title: 'Card Transaction Information',
    transaction: toKeysAndValues(transaction).map((t) => ({name: t.name, value: replaceAll(t.value, '"', '')})),
    transactionsLink: `/cards/transactions/${authorizationId}/${cardId}?card=${encodeURIComponent(req.query.card)}`,
    tppName: getEnv().TPP_NAME,
    loadingTime: (performance.now() - start1).toFixed(0),
    env: process.env.APP_ENVIRONMENT,
  });
};

const getSessionCards = async (session: AuthorizationData) => {
  logger.info(`Listing cards for session ${session.authorizationId}`);

  const authorizationId = session.authorizationId;
  const cards = await (session.interface as AisInterface).getCards();
  const cardInfos = cards.map((card) => {
    const stringified = JSON.stringify(card);
    const encodedCard = encodeURIComponent(stringified);
    return {
      ...card,
      stringified,
      transactionsLink: `/cards/transactions/${authorizationId}/${card.cardId}?card=${encodedCard}`,
    };
  });
  return {
    authorizationId,
    cards: cardInfos,
  };
};

export const renderCards = async (req: Request, res: Response) => {
  const start1 = performance.now();
  const sessions = getSessions(req);
  const accountSessions = await sessions.filter((s) => s.authorizationType === AuthorizationType.OpPsd2Accounts);
  const auths = await Promise.all(accountSessions.map(getSessionCards));
  res.render('cards', {
    isLoggedIn: true,
    title: 'Cards',
    auths,
    tppName: getEnv().TPP_NAME,
    loadingTime: (performance.now() - start1).toFixed(0),
    env: process.env.APP_ENVIRONMENT,
  });
};

export const renderCardTransactions = async (req: Request, res: Response) => {
  const authorizationId = req.params.authorizationId;
  const session = getSession(req, authorizationId);
  const cardId = req.params.cardId;
  const continuationToken = req.query.continuationToken;
  const showAllTransactions = req.query.showAllTransactions;
  const stringifiedCard = req.query.card;
  const card = JSON.parse(stringifiedCard);
  const encodedStringifiedCard = encodeURIComponent(stringifiedCard);

  if (!session) {
    throw new Error('Missing session.');
  }
  if (!session.interface) {
    throw new Error('Missing interface.');
  }
  const psd2 = session.interface;
  const start1 = performance.now();

  let transactions = new Array<CardTransaction>();
  let newContinuationToken;
  if (showAllTransactions) {
    transactions = await psd2.getAllCardTransactions(cardId);
  } else {
    const transactionPage = await psd2.getCardTransactionPage(cardId, continuationToken);
    if (transactionPage.transactions) {
      transactions = transactionPage.transactions;
    }
    newContinuationToken = transactionPage.continuationToken;
  }
  transactions = transactions.map((tr) => {
    const stringified = JSON.stringify(tr);
    return {
      ...tr,
      // tslint:disable-next-line
      transactionLink: `/cards/transaction/${authorizationId}/${cardId}?card=${encodedStringifiedCard}&transaction=${encodeURIComponent(stringified)}`,
      stringified,
    };
  });

  return res.render('card-transactions', {
    isLoggedIn: true,
    title: 'Card Transactions',
    cardNumber: card.cardNumber,
    hasTransactions: transactions.length > 0,
    transactions,
    tppName: getEnv().TPP_NAME,
    loadingTime: (performance.now() - start1).toFixed(0),
    env: process.env.APP_ENVIRONMENT,
    nextPageLink: newContinuationToken
    // tslint:disable-next-line
    ? `/cards/transactions/${authorizationId}/${cardId}?continuationToken=${newContinuationToken}&card=${encodedStringifiedCard}`
    : undefined,
    allTransactionsLink: showAllTransactions || !newContinuationToken
    ? undefined
    : `/cards/transactions/${authorizationId}/${cardId}?showAllTransactions=true&card=${encodedStringifiedCard}`,
    cardInfoLink: `/cards/${authorizationId}/${cardId}?card=${encodedStringifiedCard}`,
  });
};
