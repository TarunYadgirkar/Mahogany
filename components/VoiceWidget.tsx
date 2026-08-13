'use client';

/**
 * ElevenLabs' embeddable agent widget.
 *
 * The script is loaded here rather than in the layout so the rest of the app never waits on a CDN.
 * With no agent id configured this renders the instructions instead of a dead panel — a blank box on
 * a projector is indistinguishable from a broken deploy.
 */
import Script from 'next/script';

const WIDGET_SRC = 'https://unpkg.com/@elevenlabs/convai-widget-embed';

export default function VoiceWidget({ agentId }: { agentId: string }) {
  if (!agentId) {
    return (
      <section style={panel}>
        <p style={{ margin: '0 0 8px', fontSize: 14.5 }}>
          No agent configured. Set <code style={code}>ELEVENLABS_AGENT_ID</code> to your agent id
          (ElevenLabs → Agents → your agent → the id under its name), then reload.
        </p>
        <p style={{ margin: 0, color: '#a89486', fontSize: 13 }}>
          The tree below still works — the page panel and the extension drive it without an agent.
        </p>
      </section>
    );
  }

  return (
    <section style={panel}>
      <Script src={WIDGET_SRC} strategy="afterInteractive" />
      {/* The custom element is defined by the script above, so React just renders the tag. */}
      <elevenlabs-convai agent-id={agentId} />
      <p style={{ margin: '10px 0 0', color: '#6d5c52', fontSize: 12.5 }}>
        Microphone permission is per-origin — grant it once on this page and it sticks for the demo.
      </p>
    </section>
  );
}

const panel = {
  background: '#1b1512',
  border: '1px solid #3b2b24',
  borderRadius: 12,
  padding: 16,
} as const;

const code = {
  background: '#241b17',
  border: '1px solid #3b2b24',
  borderRadius: 4,
  padding: '1px 5px',
  fontSize: 13,
} as const;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': { 'agent-id': string };
    }
  }
}
