/**
 * Clear the branch tree so the stage opens on a bare trunk.
 *
 *   npm run atlas:reset          # branches only
 *   npm run atlas:reset -- --all # branches, insights, and routing outcomes
 *
 * Smoke-testing leaves real branches behind, and a tree that opens with "probe" nodes on it reads
 * as a dirty demo. Insights and outcomes are kept by default — they are the seeded memory the
 * reveal depends on, and re-seeding them costs an Atlas embedding wait.
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

const userId = process.env.DEMO_USER_ID ?? 'demo-user';
const dbName = process.env.MONGODB_DB ?? 'mahogany';
const all = process.argv.includes('--all');

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);

  const branches = await db.collection('branches').deleteMany({ userId });
  console.log(`deleted ${branches.deletedCount} branches for "${userId}"`);

  if (all) {
    const insights = await db.collection('insights').deleteMany({ userId });
    const outcomes = await db.collection('routing_outcomes').deleteMany({ userId });
    console.log(`deleted ${insights.deletedCount} insights and ${outcomes.deletedCount} outcomes`);
    console.log('run "npm run atlas:seed" before the demo — recall has nothing to find until you do');
  } else {
    const kept = await db.collection('insights').countDocuments({ userId });
    console.log(`kept ${kept} insights and their routing evidence`);
  }
} finally {
  await client.close();
}
