/**
 * One-shot Atlas setup. Run this FIRST — nothing else works until the vector index is queryable.
 *
 *   npm run atlas:setup
 *
 * The important part is the vector search index on `insights.text` using Automated Embedding.
 * `autoEmbed` means Atlas generates embeddings itself with Voyage, in the database: we insert plain
 * text and we query with plain text. No embedding pipeline, no separate vector store.
 *
 * The index takes 1-3 minutes to become queryable. Querying it before then returns zero results
 * with no error, which is indistinguishable from "recall is broken" — so this script waits.
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}

const dbName = process.env.MONGODB_DB ?? 'mahogany';
const INDEX = 'insight_recall';
const EMBED_MODEL = process.env.VOYAGE_MODEL ?? 'voyage-4-lite';

const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db(dbName);
  console.log(`connected to ${dbName}`);

  for (const name of ['branches', 'insights', 'routing_outcomes']) {
    const existing = await db.listCollections({ name }).toArray();
    if (!existing.length) {
      await db.createCollection(name);
      console.log(`created collection ${name}`);
    }
  }

  await db.collection('branches').createIndexes([
    { key: { id: 1 }, name: 'branch_id', unique: true },
    { key: { userId: 1, sessionId: 1, status: 1, depth: -1 }, name: 'active_lookup' },
    { key: { userId: 1, createdAt: 1 }, name: 'user_tree' },
  ]);
  await db.collection('insights').createIndexes([
    { key: { id: 1 }, name: 'insight_id', unique: true },
    { key: { userId: 1, createdAt: -1 }, name: 'user_recent' },
  ]);
  await db.collection('routing_outcomes').createIndexes([
    { key: { userId: 1, questionKind: 1 }, name: 'user_kind' },
    { key: { branchId: 1 }, name: 'by_branch' },
  ]);
  console.log('ordinary indexes ready');

  const insights = db.collection('insights');
  const existing = await insights.listSearchIndexes().toArray();

  if (existing.some((i) => i.name === INDEX)) {
    console.log(`vector index "${INDEX}" already exists — leaving it alone`);
  } else {
    await insights.createSearchIndex({
      name: INDEX,
      type: 'vectorSearch',
      definition: {
        fields: [
          // Automated Embedding: Atlas embeds this text field itself, on write and on query.
          { type: 'autoEmbed', modality: 'text', path: 'text', model: EMBED_MODEL },
          { type: 'filter', path: 'userId' },
          { type: 'filter', path: 'sourceBranchId' },
        ],
      },
    });
    console.log(`created "${INDEX}" with ${EMBED_MODEL} — waiting for it to build...`);
  }

  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    const list = await insights.listSearchIndexes().toArray();
    const idx = list.find((i) => i.name === INDEX);
    if (idx?.queryable) {
      console.log(`\nvector index is queryable (status: ${idx.status})`);
      break;
    }
    if (Date.now() > deadline) {
      console.error(`\ntimed out waiting (status: ${idx?.status ?? 'unknown'})`);
      console.error('check Search Indexes in the Atlas UI before demoing');
      process.exitCode = 1;
      break;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 5000));
  }
}

main()
  .catch((err) => {
    console.error('\nsetup failed:', err.message);
    if (/autoEmbed|modality|model|unsupported/i.test(err.message)) {
      console.error(
        '\nAutomated Embedding was rejected — either the cluster tier does not support it or the\n' +
          'model name changed. Try VOYAGE_MODEL=voyage-4 or voyage-4-large. Docs:\n' +
          'https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/\n' +
          'If the feature is genuinely unavailable, see the manual-embedding fallback in AGENTS.md.',
      );
    }
    process.exitCode = 1;
  })
  .finally(() => client.close());
