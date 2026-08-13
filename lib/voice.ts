/**
 * Tone per branch depth.
 *
 * The tree is audible, not just visible. ElevenLabs multi-voice lets one agent hold several voices
 * and switch between them mid-response by wrapping text in `<Label>…</Label>`, where the label is
 * configured on the agent. Mahogany picks the label from how deep the branch is: the trunk keeps
 * the primary voice, a side branch gets a tighter one, a branch off a branch gets tighter still.
 * Coming back up is free — a merge returns the parent branch, so the depth drops and the voice
 * reverts on its own.
 *
 * Unconfigured is the default. With no labels set the text passes through untouched and the agent
 * speaks in one voice, so a misconfigured dashboard costs the demo nothing.
 */

/** Tag labels are interpolated into markup; anything exotic gets ignored rather than escaped. */
const LABEL_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

const warned = new Set<string>();

function labelFromEnv(name: string): string | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  if (!LABEL_PATTERN.test(raw)) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[voice] ignoring ${name}="${raw}" — labels must match ${LABEL_PATTERN}`);
    }
    return null;
  }
  return raw;
}

/**
 * Which configured voice label speaks at this depth, or null for the agent's primary voice.
 * Depth 2 falls back to the branch label when no deep label is set, so configuring one voice is
 * a complete configuration.
 */
export function voiceLabelFor(depth: number): string | null {
  if (depth <= 0) return null;
  const branch = labelFromEnv('VOICE_LABEL_BRANCH');
  const deep = labelFromEnv('VOICE_LABEL_DEEP');
  return depth >= 2 ? (deep ?? branch) : branch;
}

/** Every label the agent might have emitted itself. Used to keep tags from nesting. */
function configuredLabels(): string[] {
  return [labelFromEnv('VOICE_LABEL_BRANCH'), labelFromEnv('VOICE_LABEL_DEEP')].filter(
    (l): l is string => l !== null,
  );
}

export function stripVoiceTags(text: string): string {
  const labels = configuredLabels();
  if (!labels.length) return text;
  return text.replace(new RegExp(`</?(?:${labels.join('|')})>`, 'g'), '');
}

/**
 * Wrap spoken text in the voice for this depth. Existing tags are stripped first — ElevenLabs
 * does not support nesting, and a nested tag reads out as literal angle brackets on stage.
 */
export function speakAs(text: string, depth: number): string {
  const label = voiceLabelFor(depth);
  if (!label) return text;

  const inner = stripVoiceTags(text).trim();
  if (!inner) return text;

  return `<${label}>${inner}</${label}>`;
}
