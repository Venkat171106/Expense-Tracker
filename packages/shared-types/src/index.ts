export enum AccountType {
  CHECKING = 'CHECKING',
  SAVINGS = 'SAVINGS',
  CREDIT_CARD = 'CREDIT_CARD',
  CASH_WALLET = 'CASH_WALLET',
  INVESTMENT = 'INVESTMENT',
  LOAN = 'LOAN',
}

export enum TransactionType {
  EXPENSE = 'EXPENSE',
  INCOME = 'INCOME',
  TRANSFER = 'TRANSFER',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum EntryType {
  ACCOUNT_LEG = 'ACCOUNT_LEG',
  CATEGORY_LEG = 'CATEGORY_LEG',
  RECEIVABLE_LEG = 'RECEIVABLE_LEG',
  PAYABLE_LEG = 'PAYABLE_LEG',
}

export enum ImportStatus {
  PENDING = 'PENDING',
  PARSING = 'PARSING',
  PREVIEW_READY = 'PREVIEW_READY',
  COMMITTED = 'COMMITTED',
  FAILED = 'FAILED',
}

export enum ImportRecordStatus {
  PENDING = 'PENDING',
  MATCHED_DUPLICATE = 'MATCHED_DUPLICATE',
  VALIDATED = 'VALIDATED',
  COMMITTED = 'COMMITTED',
  IGNORED = 'IGNORED',
}

export enum RuleMatchField {
  PAYEE = 'PAYEE',
  RAS_DESCRIPTION = 'RAW_DESCRIPTION',
  AMOUNT = 'AMOUNT',
}

export enum RuleMatchType {
  EXACT = 'EXACT',
  CONTAINS = 'CONTAINS',
  STARTS_WITH = 'STARTS_WITH',
  REGEX = 'REGEX',
}

export interface MoneyAmountDto {
  amount: string;
  currency: string;
  formatted?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta?: Record<string, unknown>;
}
