/**
 * Build a realistic tree — branches, nested branches, merges, abandons — so the page shows what a
 * real session looks like instead of one lonely node.
 *
 *   npm run demo:tree                 # against PUBLIC_URL
 *   npm run demo:tree -- --local      # against localhost:3002
 *
 * Drives the same public routes every client uses, with TOOL_SECRET read from the environment. That
 * matters: nothing here reaches into Atlas directly, so every node carries a real compiled brief,
 * real recall, and a real routing decision. A tree faked at the database layer would look right and
 * prove nothing.
 */
const local = process.argv.includes('--local');
const base = (local ? 'http://localhost:3002' : (process.env.PUBLIC_URL ?? 'http://localhost:3000')).replace(
  /\/$/,
  '',
);
const secret = process.env.TOOL_SECRET ?? '';

async function call(action, body) {
  const res = await fetch(`${base}/api/tools/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-mahogany-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} → ${res.status} ${json.error ?? ''}`);
  return json;
}

/**
 * Two sessions, because the reveal is cross-session recall: the second one has never heard any of
 * this and still opens warm. Questions are deliberately adjacent to the seeded insights, and the
 * `compare` ones exist to make the router choose OpenRouter out loud.
 */
const SCRIPT = [
  { session: 'demo-main', act: 'fork', text: 'should we use a managed vector index or run our own?' },
  {
    session: 'demo-main',
    act: 'merge',
    text: 'Managed vector search wins — we cannot install extensions on the target host.',
  },
  { session: 'demo-main', act: 'fork', text: 'what batch size should the ingest job use?' },
  { session: 'demo-main', act: 'fork', text: 'is 500 documents per batch safe inside a 60 second function?' },
  {
    session: 'demo-main',
    act: 'merge',
    text: 'Keep batches at 500 documents so the job finishes inside the serverless ceiling.',
  },
  { session: 'demo-main', act: 'fork', text: 'should a stalled ingest job page someone at 3am?' },
  { session: 'demo-main', act: 'abandon' },
  { session: 'demo-main', act: 'fork', text: 'compare managed vector search against a separate vector store for us' },
  {
    session: 'demo-main',
    act: 'merge',
    text: 'One platform beats a bolted-on vector store — one connection string, one bill, one thing to page about.',
  },
  { session: 'demo-second', act: 'fork', text: 'how should alerting work for the ingest pipeline?' },
  { session: 'demo-second', act: 'fork', text: 'compare Fireworks and OpenRouter for our reasoning calls' },
];

console.log(`building the demo tree against ${base}\n`);

for (const [i, step] of SCRIPT.entries()) {
  const label = `${i + 1}/${SCRIPT.length} ${step.act}`;
  try {
    if (step.act === 'fork') {
      const r = await call('fork', { question: step.text, session_id: step.session });
      console.log(
        `${label} depth ${r.depth} · ${r.recalled} recalled · ${r.provider} · ${r.reason ?? ''}`.trim(),
      );
    } else if (step.act === 'merge') {
      const r = await call('merge', { insight: step.text, session_id: step.session });
      console.log(`${label} → back to ${JSON.stringify(r.back_to ?? '')}`);
    } else {
      const r = await call('return', { session_id: step.session });
      console.log(`${label} → ${r.speak ?? 'dropped'}`);
    }
  } catch (err) {
    // Keep going: a single failed step leaves a usable tree, and stopping here would leave a worse one.
    console.error(`${label} FAILED — ${err.message}`);
  }
}

console.log('\ndone — open the tree page');
