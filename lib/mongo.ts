/**
 * Single shared Atlas client. Next.js hot-reloads modules in dev, so the client is cached on
 * globalThis — without that you leak a connection pool per reload and Atlas starts refusing.
 */
import { MongoClient, type Collection, type Db } from 'mongodb';
import type { Branch, InsightDoc, RoutingOutcome } from './types';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is not set — copy .env.example to .env.local');

const dbName = process.env.MONGODB_DB ?? 'mahogany';

declare global {
  // eslint-disable-next-line no-var
  var __mahoganyMongo: Promise<MongoClient> | undefined;
}

const clientPromise: Promise<MongoClient> =
  globalThis.__mahoganyMongo ?? new MongoClient(uri).connect();

if (process.env.NODE_ENV !== 'production') globalThis.__mahoganyMongo = clientPromise;

export function client(): Promise<MongoClient> {
  return clientPromise;
}

export async function db(): Promise<Db> {
  return (await clientPromise).db(dbName);
}

export async function branches(): Promise<Collection<Branch>> {
  return (await db()).collection<Branch>('branches');
}

export async function insights(): Promise<Collection<InsightDoc>> {
  return (await db()).collection<InsightDoc>('insights');
}

export async function outcomes(): Promise<Collection<RoutingOutcome>> {
  return (await db()).collection<RoutingOutcome>('routing_outcomes');
}

export const INSIGHT_VECTOR_INDEX = 'insight_recall';
export const DB_NAME = dbName;
