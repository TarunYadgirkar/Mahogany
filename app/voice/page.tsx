import LiveTree from '@/components/LiveTree';
import VoiceWidget from '@/components/VoiceWidget';

export const dynamic = 'force-dynamic';

/**
 * The voice agent and the tree on one screen.
 *
 * The extension opens this instead of embedding the widget itself: an MV3 popup cannot load a remote
 * script, and ElevenLabs' widget is one. Reading the agent id at request time rather than through a
 * NEXT_PUBLIC_ build-time inline means setting it in Vercel takes effect without a rebuild.
 */
export default function VoicePage() {
  const agentId = process.env.ELEVENLABS_AGENT_ID ?? '';
  const userId = process.env.DEMO_USER_ID ?? 'demo-user';

  return (
    <main style={{ maxWidth: 1240, margin: '0 auto', padding: '36px 24px 80px' }}>
      <header style={{ marginBottom: 22 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: '#c4703f',
            margin: '0 0 10px',
          }}
        >
          Mahogany · voice
        </p>
        <h1 style={{ fontSize: 26, lineHeight: 1.25, margin: '0 0 8px', fontWeight: 600 }}>
          Talk to it. Watch the tree move.
        </h1>
        <p style={{ color: '#a89486', margin: 0, maxWidth: 760, fontSize: 15 }}>
          Say &ldquo;hold on, side question&rdquo; and a branch appears below while you are still
          talking. Say &ldquo;merge that&rdquo; and the conclusion lands in long-term memory.
        </p>
      </header>

      <VoiceWidget agentId={agentId} />

      <div style={{ marginTop: 26 }}>
        <LiveTree userId={userId} />
      </div>
    </main>
  );
}
