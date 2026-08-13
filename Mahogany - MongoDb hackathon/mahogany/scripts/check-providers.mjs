/**
 * Prove every model id in the catalog actually resolves, on both providers.
 *
 *   npm run providers:check
 *
 * Thirty seconds here saves a 404 in the middle of the first live branch. Model ids drift; this is
 * the only way to know yours are current.
 */
const targets = [
  {
    provider: 'fireworks',
    base: process.env.FIREWORKS_BASE_URL ?? 'https://api.fireworks.ai/inference/v1',
    key: process.env.FIREWORKS_API_KEY,
    models: [
      process.env.FW_MODEL_QUICK ?? 'accounts/fireworks/models/llama-v3p1-8b-instruct',
      process.env.FW_MODEL_THOUGHTFUL ?? 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    ],
    browse: 'https://fireworks.ai/models',
  },
  {
    provider: 'openrouter',
    base: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    key: process.env.OPENROUTER_API_KEY,
    models: [
      process.env.OR_MODEL_THOUGHTFUL ?? 'openai/gpt-4o-mini',
      process.env.OR_MODEL_DEEP ?? 'anthropic/claude-3.5-sonnet',
    ],
    browse: 'https://openrouter.ai/models',
  },
];

let failed = false;

for (const t of targets) {
  if (!t.key) {
    console.log(`SKIP ${t.provider} — no API key set`);
    continue;
  }
  for (const model of t.models) {
    const started = Date.now();
    try {
      const res = await fetch(`${t.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'reply with the single word: ok' }],
          max_tokens: 5,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content ?? '';
        console.log(`OK   ${t.provider} ${model} (${Date.now() - started}ms) → ${JSON.stringify(text)}`);
      } else {
        failed = true;
        console.error(`FAIL ${t.provider} ${model} → ${res.status} ${(await res.text()).slice(0, 160)}`);
        console.error(`     browse ${t.browse} for a current id`);
      }
    } catch (err) {
      failed = true;
      console.error(`FAIL ${t.provider} ${model} → ${err.message}`);
    }
  }
}

if (failed) process.exitCode = 1;
