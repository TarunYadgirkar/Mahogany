'use client';

/**
 * The stage fallback: drive the whole loop from the page, with no voice agent involved.
 *
 * Phase 3 is the part of the demo most likely to fail live — a webhook the agent declines to call,
 * a mic that will not bind, an ElevenLabs outage. PLAN.md's answer was "keep the curl path working",
 * but nobody wants to alt-tab to a terminal in front of judges. Same routes, same secret, buttons.
 *
 * The secret is typed in by the operator and kept in sessionStorage, never baked into the bundle.
 * That matters: this page is public, and the fork and merge routes spend provider credits.
 */
import { useEffect, useState } from 'react';

type Action = 'fork' | 'merge' | 'return';

interface ToolResponse {
  ok?: boolean;
  speak?: string;
  error?: string;
  recalled?: number;
  provider?: string;
  reason?: string;
  depth?: number;
  mock?: boolean;
}

const SECRET_KEY = 'mahogany.secret';

export default function ManualControl() {
  const [secret, setSecret] = useState('');
  const [session, setSession] = useState('stage');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<ToolResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Survive the reload that a mid-demo code change or an accidental refresh causes.
  useEffect(() => {
    setSecret(sessionStorage.getItem(SECRET_KEY) ?? '');
  }, []);

  const remember = (value: string) => {
    setSecret(value);
    sessionStorage.setItem(SECRET_KEY, value);
  };

  const run = async (action: Action) => {
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, string> = { session_id: session };
      if (action === 'fork') body.question = text;
      if (action === 'merge' && text.trim()) body.insight = text;

      const res = await fetch(`/api/tools/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(secret ? { 'x-mahogany-secret': secret } : {}),
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as ToolResponse;
      if (!res.ok) {
        // 401 here means the typed secret and TOOL_SECRET disagree — the one failure an operator
        // cannot diagnose from the tree, because nothing on it moves.
        setError(res.status === 401 ? 'Wrong secret — the server rejected it.' : (json.error ?? `HTTP ${res.status}`));
        return;
      }
      setResult(json);
      if (action === 'fork') setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setBusy(null);
    }
  };

  const canFork = text.trim().length > 3 && busy === null;

  return (
    <section
      style={{
        marginTop: 24,
        background: '#1b1512',
        border: '1px solid #3b2b24',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <h2
          style={{
            fontSize: 11,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: '#c4703f',
            margin: 0,
          }}
        >
          Manual control
        </h2>
        <span style={{ color: '#6d5c52', fontSize: 12.5 }}>
          same routes the voice agent calls — works with no agent at all
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          type="password"
          value={secret}
          onChange={(e) => remember(e.target.value)}
          placeholder="TOOL_SECRET"
          aria-label="Tool secret"
          style={{ ...inputStyle, flex: '1 1 240px' }}
        />
        <input
          type="text"
          value={session}
          onChange={(e) => setSession(e.target.value)}
          placeholder="session id"
          aria-label="Session id"
          style={{ ...inputStyle, flex: '0 1 160px' }}
        />
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask a side question, or write the one line to keep when merging."
        rows={2}
        aria-label="Question or insight"
        style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: 10 }}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => void run('fork')} disabled={!canFork} style={primaryButton(canFork)}>
          {busy === 'fork' ? 'Forking…' : 'Fork'}
        </button>
        <button onClick={() => void run('merge')} disabled={busy !== null} style={secondaryButton}>
          {busy === 'merge' ? 'Merging…' : 'Merge'}
        </button>
        <button onClick={() => void run('return')} disabled={busy !== null} style={secondaryButton}>
          {busy === 'return' ? 'Dropping…' : 'Abandon'}
        </button>
      </div>

      {error && (
        <p style={{ color: '#d9776a', fontSize: 13, margin: '12px 0 0' }} role="alert">
          {error}
        </p>
      )}

      {result?.speak && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #3b2b24' }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: '#e8ddd4' }}>
            {result.speak}
          </p>
          {(result.provider || result.recalled !== undefined) && (
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#a89486' }}>
              {result.provider ? `${result.provider}` : ''}
              {result.recalled !== undefined ? ` · ${result.recalled} recalled` : ''}
              {result.mock ? ' · mock' : ''}
              {result.reason ? ` · ${result.reason}` : ''}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const inputStyle = {
  background: '#241b17',
  border: '1px solid #3b2b24',
  borderRadius: 8,
  padding: '9px 11px',
  color: '#e8ddd4',
  fontSize: 14,
  fontFamily: 'inherit',
} as const;

function primaryButton(enabled: boolean) {
  return {
    background: enabled ? '#c4703f' : '#4a3529',
    color: enabled ? '#1b1512' : '#8a7568',
    border: 'none',
    borderRadius: 8,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
  } as const;
}

const secondaryButton = {
  background: 'transparent',
  color: '#e8ddd4',
  border: '1px solid #3b2b24',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 14,
  cursor: 'pointer',
} as const;
