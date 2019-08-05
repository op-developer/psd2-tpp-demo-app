export type Iban = string | undefined;
export type CardNumber = string | undefined;

export enum IdentifierScheme {
  Iban = 'Iban',
}

export enum Currency {
  Euro = 'EUR',
}

export interface Account {
  accountId: string;
  currency: Currency;
  productName: string;
  identifier: string;
  identifierScheme: IdentifierScheme;
  balance?: string;
}

export interface Transaction {
  transactionId?: string;
  date?: Date;
  amount?: string;
  label?: string;
  info?: string;
  recipient?: string;
  payer?: string;
  proprietaryTransactionCode?: string;
}

export interface TransactionPage {
  continuationToken?: string;
  transactions: Transaction[];
}

export interface Card {
  cardId: string;
  productName: string;
  cardNumber: string;
}

export interface CardTransaction {
  description?: string;
  amount?: string;
  currency?: Currency;
  postingDate?: string;
}

export interface CardTransactionPage {
  transactions?: CardTransaction[];
  continuationToken?: string;
}

/** Interface for Account Information Services */
export interface AisInterface {
  getAccounts(): Promise<Account[]>;
  getAccount(accountId: string): Promise<Account>;
  getAllTransactions(accountId: string): Promise<Transaction[]>;
  getTransactionPage(accountId: string, continuationToken?: string): Promise<TransactionPage>;
  getCards(): Promise<Card[]>;
  getAllCardTransactions(cardId: string): Promise<CardTransaction[]>;
  getCardTransactionPage(cardId: string, continuationToken?: string): Promise<CardTransactionPage>;
}
