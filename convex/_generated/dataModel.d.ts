/* eslint-disable */
/**
 * Generated data model types.
 * 
 * THIS IS A STUB FILE - Run `npx convex dev` to generate the real version.
 */

import type { GenericId } from "convex/values";

// Table names type
export type TableNames =
  | "users"
  | "intents"
  | "cards"
  | "wallets"
  | "authorizations"
  | "authorizationHolds"
  | "fraud"
  | "defi"
  | "compliance"
  | "fundingTransactions"
  | "cryptoRates"
  | "virtualIbans"
  | "moonpayTransactions";

// Generic ID type for all tables
export type Id<TableName extends TableNames> = GenericId<TableName>;

// Document type for all tables (stub)
export type Doc<TableName extends TableNames> = {
  _id: Id<TableName>;
  _creationTime: number;
  [key: string]: any;
};

// Data model type
export type DataModel = {
  [K in TableNames]: {
    document: Doc<K>;
    fieldPaths: string;
    indexes: {};
    searchIndexes: {};
    vectorIndexes: {};
  };
};

