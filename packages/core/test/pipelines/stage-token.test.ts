import { describe, it, expect } from 'vitest';
import { stageNameToFilesystemToken } from '@/pipelines/stage-token';

describe('stageNameToFilesystemToken', () => {
  it('lowercases editorial stages cleanly', () => {
    expect(stageNameToFilesystemToken('Ideas')).toBe('ideas');
    expect(stageNameToFilesystemToken('Drafting')).toBe('drafting');
    expect(stageNameToFilesystemToken('Final')).toBe('final');
    expect(stageNameToFilesystemToken('Published')).toBe('published');
  });

  it('kebab-cases multi-word stage names', () => {
    expect(stageNameToFilesystemToken('My Stage')).toBe('my-stage');
    expect(stageNameToFilesystemToken('In Review')).toBe('in-review');
  });

  it('collapses runs of whitespace into a single hyphen', () => {
    expect(stageNameToFilesystemToken('In   Review')).toBe('in-review');
    expect(stageNameToFilesystemToken('  Drafting  ')).toBe('drafting');
  });

  it('preserves digits and hyphens', () => {
    expect(stageNameToFilesystemToken('stage-1')).toBe('stage-1');
    expect(stageNameToFilesystemToken('Iteration 2')).toBe('iteration-2');
  });

  it('preserves underscores', () => {
    expect(stageNameToFilesystemToken('Stage_One')).toBe('stage_one');
  });

  it('rejects empty input', () => {
    expect(() => stageNameToFilesystemToken('')).toThrow(/empty or whitespace-only/);
    expect(() => stageNameToFilesystemToken('   ')).toThrow(/empty or whitespace-only/);
  });

  it('rejects path separators', () => {
    expect(() => stageNameToFilesystemToken('PROD/Staging')).toThrow(/cannot be safely tokenized/);
    expect(() => stageNameToFilesystemToken('foo\\bar')).toThrow(/cannot be safely tokenized/);
  });

  it('rejects non-ASCII characters', () => {
    expect(() => stageNameToFilesystemToken('Café')).toThrow(/cannot be safely tokenized/);
    expect(() => stageNameToFilesystemToken('日本語')).toThrow(/cannot be safely tokenized/);
  });

  it('rejects names that start with a hyphen or underscore', () => {
    expect(() => stageNameToFilesystemToken('-leading')).toThrow(/cannot be safely tokenized/);
    expect(() => stageNameToFilesystemToken('_leading')).toThrow(/cannot be safely tokenized/);
  });

  it('rejects special punctuation', () => {
    expect(() => stageNameToFilesystemToken('Stage!')).toThrow(/cannot be safely tokenized/);
    expect(() => stageNameToFilesystemToken('Stage.One')).toThrow(/cannot be safely tokenized/);
    expect(() => stageNameToFilesystemToken('Stage@One')).toThrow(/cannot be safely tokenized/);
  });
});
