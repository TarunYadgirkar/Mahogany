import { afterEach, describe, expect, it } from 'vitest';
import { speakAs, stripVoiceTags, voiceLabelFor } from '../lib/voice';

function setLabels(branch?: string, deep?: string): void {
  if (branch === undefined) delete process.env.VOICE_LABEL_BRANCH;
  else process.env.VOICE_LABEL_BRANCH = branch;
  if (deep === undefined) delete process.env.VOICE_LABEL_DEEP;
  else process.env.VOICE_LABEL_DEEP = deep;
}

afterEach(() => setLabels());

describe('voiceLabelFor', () => {
  it('leaves the trunk on the primary voice', () => {
    setLabels('Branch', 'Deep');
    expect(voiceLabelFor(0)).toBeNull();
  });

  it('shifts on the first fork and again on the second', () => {
    setLabels('Branch', 'Deep');
    expect(voiceLabelFor(1)).toBe('Branch');
    expect(voiceLabelFor(2)).toBe('Deep');
    expect(voiceLabelFor(5)).toBe('Deep');
  });

  it('treats one configured voice as a complete configuration', () => {
    setLabels('Branch');
    expect(voiceLabelFor(2)).toBe('Branch');
  });

  it('ignores a label that would not survive interpolation', () => {
    setLabels('<script>');
    expect(voiceLabelFor(1)).toBeNull();
  });
});

describe('speakAs', () => {
  it('passes text through untouched when nothing is configured', () => {
    setLabels();
    expect(speakAs('Kept it. Back to the main thread.', 2)).toBe(
      'Kept it. Back to the main thread.',
    );
  });

  it('wraps branch speech in the configured voice', () => {
    setLabels('Branch');
    expect(speakAs('Managed vector search wins.', 1)).toBe(
      '<Branch>Managed vector search wins.</Branch>',
    );
  });

  it('never nests — ElevenLabs reads a nested tag out loud', () => {
    setLabels('Branch', 'Deep');
    expect(speakAs('<Branch>Already tagged.</Branch>', 2)).toBe('<Deep>Already tagged.</Deep>');
  });

  it('leaves empty speech alone rather than emitting a hollow tag', () => {
    setLabels('Branch');
    expect(speakAs('   ', 1)).toBe('   ');
  });

  it('survives the sentence chunking the streaming endpoint does', () => {
    setLabels('Branch');
    const tagged = speakAs('First sentence. Second one.', 1);
    const pieces = tagged.match(/[^.!?]+[.!?]*\s*/g) ?? [tagged];
    // The opening tag must ride out on the first chunk so speech starts in the right voice.
    expect(pieces[0]).toContain('<Branch>');
    expect(pieces.join('')).toBe(tagged);
  });
});

describe('stripVoiceTags', () => {
  it('only strips labels that are actually configured', () => {
    setLabels('Branch');
    expect(stripVoiceTags('<Branch>a</Branch> <Other>b</Other>')).toBe('a <Other>b</Other>');
  });
});
