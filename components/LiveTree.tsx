'use client';

/**
 * The stage visual. A tree that moves because Atlas told it to.
 *
 * Everything here is driven by the SSE feed off MongoDB change streams — there is no polling and
 * no local simulation of state. A branch appears because a document landed; an insight lights up
 * because a merge wrote one. If the projector shows movement, the database caused it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Branch, InsightDoc } from '@/lib/types';

interface Evidence {
  questionKind: string;
  provider: string;
  model: string;
  samples: number;
  successRate: number;
  avgCostUsd: number;
}

// Sized for a projector at the back of a room, not for a laptop screen. Every value here was
// picked so the smallest glyph stays legible after the room lights come up.
const COL = 300;
const ROW = 124;
const NODE_W = 260;
const NODE_H = 86;

export default function LiveTree({ userId }: { userId: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [memory, setMemory] = useState<InsightDoc[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlight = useCallback((id: string) => {
    setFlash(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  }, []);

  const refreshEvidence = useCallback(async () => {
    try {
      const res = await fetch(`/api/evidence?userId=${encodeURIComponent(userId)}`);
      const json = (await res.json()) as { evidence?: Evidence[] };
      setEvidence(json.evidence ?? []);
    } catch {
      // The panel is informational; a failed refresh is not worth surfacing mid-demo.
    }
  }, [userId]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/branches?userId=${encodeURIComponent(userId)}`);
      const json = (await res.json()) as { branches?: Branch[]; insights?: InsightDoc[] };
      setBranches(json.branches ?? []);
      setMemory(json.insights ?? []);
    })();
    void refreshEvidence();
  }, [userId, refreshEvidence]);

  useEffect(() => {
    const source = new EventSource(`/api/stream?userId=${encodeURIComponent(userId)}`);

    source.addEventListener('ready', () => setLive(true));
    source.addEventListener('degraded', () => setLive(false));

    source.addEventListener('branch', (e) => {
      const branch = JSON.parse((e as MessageEvent).data) as Branch;
      setBranches((prev) => {
        const next = prev.filter((b) => b.id !== branch.id);
        next.push(branch);
        return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      highlight(branch.id);
      void refreshEvidence();
    });

    source.addEventListener('insight', (e) => {
      const insight = JSON.parse((e as MessageEvent).data) as InsightDoc;
      setMemory((prev) => [insight, ...prev.filter((i) => i.id !== insight.id)].slice(0, 30));
      highlight(insight.sourceBranchId);
    });

    source.onerror = () => setLive(false);
    return () => source.close();
  }, [userId, highlight, refreshEvidence]);

  const layout = useMemo(() => computeLayout(branches), [branches]);
  const totals = useMemo(() => {
    const forked = branches.filter((b) => b.brief);
    const pruned = forked.length
      ? Math.round(forked.reduce((s, b) => s + (b.brief?.prunedPct ?? 0), 0) / forked.length)
      : 0;
    const recalled = forked.reduce((s, b) => s + (b.brief?.recalled.length ?? 0), 0);
    return { branches: forked.length, pruned, recalled, memory: memory.length };
  }, [branches, memory]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24 }}>
      <section>
        <Header live={live} totals={totals} />
        <div
          style={{
            background: '#1b1512',
            border: '1px solid #3b2b24',
            borderRadius: 12,
            padding: 16,
            overflowX: 'auto',
            minHeight: 520,
          }}
        >
          {layout.nodes.length === 0 ? (
            <Empty />
          ) : (
            <svg
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              style={{ maxWidth: '100%' }}
            >
              {layout.edges.map((edge) => (
                <path
                  key={edge.key}
                  d={edge.d}
                  fill="none"
                  stroke={edge.merged ? '#7cc189' : '#63493c'}
                  strokeWidth={edge.merged ? 4 : 2.5}
                />
              ))}
              {layout.nodes.map((node) => (
                <Node key={node.branch.id} node={node} flashing={flash === node.branch.id} />
              ))}
            </svg>
          )}
        </div>
      </section>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Panel title="Long-term memory" hint="every merged conclusion, vector-indexed in Atlas">
          {memory.length === 0 ? (
            <Muted>Nothing merged yet.</Muted>
          ) : (
            memory.slice(0, 6).map((m) => (
              <div key={m.id} style={{ marginBottom: 14, fontSize: 15, lineHeight: 1.5 }}>
                <span style={{ color: '#f6ece3' }}>{m.text}</span>
                <span style={{ display: 'block', color: '#f0b64a', fontSize: 13, marginTop: 3 }}>
                  from &ldquo;{m.sourceTitle}&rdquo;
                </span>
              </div>
            ))
          )}
        </Panel>

        <Panel title="What the router learned" hint="aggregated from routing_outcomes">
          {evidence.length === 0 ? (
            <Muted>No outcomes recorded yet.</Muted>
          ) : (
            evidence.slice(0, 5).map((e, i) => (
              <div key={`${e.questionKind}-${e.model}-${i}`} style={{ marginBottom: 13, fontSize: 15 }}>
                <div style={{ color: '#f6ece3' }}>
                  {e.questionKind} → <b style={{ color: '#e08a4e' }}>{e.provider}</b>
                </div>
                <div style={{ color: '#c3ad9e', fontSize: 13 }}>
                  {Math.round(e.successRate * 100)}% kept · {e.samples} runs · $
                  {e.avgCostUsd.toFixed(4)} avg
                </div>
              </div>
            ))
          )}
        </Panel>
      </aside>
    </div>
  );
}

function Header({
  live,
  totals,
}: {
  live: boolean;
  totals: { branches: number; pruned: number; recalled: number; memory: number };
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 24,
        marginBottom: 16,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, color: '#c3ad9e' }}>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            flexShrink: 0,
            background: live ? '#7cc189' : '#e0715f',
            boxShadow: live ? '0 0 12px rgba(124,193,137,.8)' : 'none',
          }}
        />
        {live ? 'change stream live' : 'stream offline'}
      </span>
      <Stat label="branches" value={String(totals.branches)} />
      <Stat label="avg pruned" value={`${totals.pruned}%`} />
      <Stat label="facts recalled" value={String(totals.recalled)} />
      <Stat label="in memory" value={String(totals.memory)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 14, color: '#c3ad9e' }}>
      {label} <b style={{ color: '#f6ece3', fontSize: 22 }}>{value}</b>
    </span>
  );
}

function Node({ node, flashing }: { node: PositionedNode; flashing: boolean }) {
  const { branch, x, y } = node;
  const merged = branch.status === 'merged';
  const abandoned = branch.status === 'abandoned';
  const stroke = merged ? '#7cc189' : abandoned ? '#6b584e' : flashing ? '#f0b64a' : '#b0562f';
  const recalled = branch.brief?.recalled.length ?? 0;

  return (
    <g transform={`translate(${x},${y})`} opacity={abandoned ? 0.55 : 1}>
      {flashing ? (
        <rect
          x={-5}
          y={-5}
          width={NODE_W + 10}
          height={NODE_H + 10}
          rx={14}
          fill="none"
          stroke="#f0b64a"
          strokeWidth={3}
          opacity={0.35}
        />
      ) : null}
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={10}
        fill={flashing ? '#3a2a20' : '#241b17'}
        stroke={stroke}
        strokeWidth={flashing ? 4 : 2}
      />
      <text x={16} y={30} fill="#f6ece3" fontSize={17} fontWeight={600}>
        {clip(branch.title || 'Main thread', 27)}
      </text>
      <text x={16} y={54} fill="#c3ad9e" fontSize={13.5}>
        {branch.brief
          ? `${branch.brief.prunedPct}% pruned · ${branch.brief.briefTokens} tok`
          : 'trunk'}
      </text>
      <text x={16} y={74} fill={recalled ? '#f0b64a' : '#9b8779'} fontSize={13.5} fontWeight={recalled ? 600 : 400}>
        {recalled ? `${recalled} recalled` : branch.routing?.provider || ''}
        {branch.routing?.fromEvidence ? ' · from evidence' : ''}
      </text>
      {merged ? (
        <circle cx={NODE_W - 18} cy={18} r={7} fill="#7cc189" />
      ) : null}
    </g>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: '#1b1512',
        border: '1px solid #3b2b24',
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '.09em',
          textTransform: 'uppercase',
          color: '#e08a4e',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: '#9b8779', marginBottom: 14 }}>{hint}</div>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 15, color: '#9b8779' }}>{children}</div>;
}

function Empty() {
  return (
    <div style={{ padding: '110px 20px', textAlign: 'center', color: '#9b8779' }}>
      <div style={{ fontSize: 22, marginBottom: 10, color: '#c3ad9e' }}>Waiting for the first turn.</div>
      <div style={{ fontSize: 16 }}>Say &ldquo;hold on, side question&rdquo; to sprout a branch.</div>
    </div>
  );
}

interface PositionedNode {
  branch: Branch;
  x: number;
  y: number;
}

/**
 * Depth drives the column, arrival order drives the row. Deliberately not a force layout: on a
 * projector, a tree that reflows every time a node lands is unreadable, and the audience needs
 * the previous branch to still be where they last saw it.
 */
function computeLayout(branches: Branch[]): {
  nodes: PositionedNode[];
  edges: { key: string; d: string; merged: boolean }[];
  width: number;
  height: number;
} {
  const sorted = [...branches].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rowByDepth = new Map<number, number>();
  const positions = new Map<string, PositionedNode>();

  for (const branch of sorted) {
    const row = rowByDepth.get(branch.depth) ?? 0;
    rowByDepth.set(branch.depth, row + 1);
    positions.set(branch.id, {
      branch,
      x: 20 + branch.depth * COL,
      y: 20 + row * ROW,
    });
  }

  const edges: { key: string; d: string; merged: boolean }[] = [];
  for (const node of positions.values()) {
    if (!node.branch.parentId) continue;
    const parent = positions.get(node.branch.parentId);
    if (!parent) continue;

    const x1 = parent.x + NODE_W;
    const y1 = parent.y + NODE_H / 2;
    const x2 = node.x;
    const y2 = node.y + NODE_H / 2;
    const mid = (x1 + x2) / 2;

    edges.push({
      key: `${parent.branch.id}-${node.branch.id}`,
      d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
      merged: node.branch.status === 'merged',
    });
  }

  const nodes = [...positions.values()];
  const width = Math.max(760, ...nodes.map((n) => n.x + NODE_W + 30));
  const height = Math.max(480, ...nodes.map((n) => n.y + NODE_H + 30));
  return { nodes, edges, width, height };
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
