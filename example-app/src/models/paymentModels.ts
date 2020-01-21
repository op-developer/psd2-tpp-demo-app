export interface StartAuthorizationResponse {
    payments: PaymentInfo[];
}

export interface PaymentErrorPayload {
    httpCode: number;
    errorDescription: string;
}

export interface PaymentInfo {
    type: PaymentType;
    paymentId: string;
    amount: string;
    currency: string;
    count: number;
    payee: PaymentParty;
    payer: PaymentParty;
}

export interface PaymentParty {
    iban: string;
}

export enum PaymentType {
  SEPA,
}

export interface PaymentDetails {
    amountEUR: string;
    count: number;
    payee: PaymentParty;
    payer: PaymentParty;
    message: string;
    paymentId: string;
    authorizationId: string;
    status: string;
}

export interface SubmissionResult {
    paymentId?: string;
    status: string;
}

export interface AuthorizedPayments {
    authorizedCount?: number;
    payments: PaymentDetails[];
}

export interface ForeignPayment {
    payee: ForeignPayee;
    amount: string;
    currency: string;
    message: string;
    payer?: PaymentParty;
    count: number;
    authorizationId?: string;
}

export interface ForeignPayee {
    bankAccount: ForeignBankAccount;
    name: string;
    foreignAddress: ForeignAddress;
    financialInstitution: ForeignFinancialInstitution;

}

export interface ForeignBankAccount {
    schemeName: string;
    id: string;
    issuer: string;
}

export interface ForeignAddress {
    addressLine1: string;
    addressLine2: string;
    country: string;
}

export interface ForeignFinancialInstitution {
    bic: string;
}
