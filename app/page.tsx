import LiveTree from '@/components/LiveTree';

export const dynamic = 'force-dynamic';

/** The projector view. Open this next to the voice call and do not touch it during the demo. */
export default function Home() {
  const userId = process.env.DEMO_USER_ID ?? 'demo-user';

  return (
    <main style={{ maxWidth: 1240, margin: '0 auto', padding: '36px 24px 80px' }}>
      <header style={{ marginBottom: 26 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: '#c4703f',
            margin: '0 0 10px',
          }}
        >
          Mahogany
        </p>
        <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: '0 0 10px', fontWeight: 600 }}>
          A conversation that branches, and remembers what the branches concluded.
        </h1>
        <p style={{ color: '#a89486', margin: 0, maxWidth: 760, fontSize: 15 }}>
          Speak normally. Say &ldquo;hold on, side question&rdquo; and it forks with a compiled
          brief instead of the whole transcript. Say &ldquo;merge that&rdquo; and one distilled line
          goes into memory, where every future conversation can recall it.
        </p>
      </header>

      <LiveTree userId={userId} />

      <footer
        style={{
          marginTop: 34,
          paddingTop: 18,
          borderTop: '1px solid #3b2b24',
          color: '#6d5c52',
          fontSize: 12.5,
          lineHeight: 1.7,
        }}
      >
        MongoDB Atlas holds the tree, the merged insights (Vector Search with Automated Embedding),
        and the routing outcomes the router aggregates to choose between Fireworks and OpenRouter.
        LangGraph runs the branch loop and checkpoints it. ElevenLabs is the voice.
      </footer>
    </main>
  );
}
