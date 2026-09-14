import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA, serializeRubric, formatScore, evidenceChallenge, formatGen, friendlyError, isAddress, parseGen, sameAddress, shortAddress } from '../lib/protocol';

describe('protocol value formatting', () => {
  it('preserves exact fractional scores rather than rounding the ranking', () => {
    expect(formatScore('6980')).toBe('69.8');
    expect(formatScore(10000)).toBe('100');
    expect(formatScore(0)).toBe('0');
    expect(formatScore('7400')).toBe('74');
  });
  it('round-trips whole and fractional GEN amounts', () => {
    expect(parseGen('1.2500')).toBe(1_250_000_000_000_000_000n);
    expect(formatGen(parseGen('1.2500'))).toBe('1.25');
    expect(formatGen(1_000_000_000_000_000n)).toBe('0.001');
  });

  it('rejects ambiguous and over-precision amounts', () => {
    expect(() => parseGen('-1')).toThrow('valid GEN amount');
    expect(() => parseGen('0.0000000000000000001')).toThrow('valid GEN amount');
  });
});

describe('locked weighted rubric', () => {
  it('serializes valid criteria without changing the weights', () => {
    expect(JSON.parse(serializeRubric(DEFAULT_CRITERIA))).toEqual(DEFAULT_CRITERIA);
  });
  it('rejects invalid totals, fractional weights and duplicate IDs', () => {
    expect(() => serializeRubric(DEFAULT_CRITERIA.map((row, i) => i === 0 ? { ...row, weight: 39 } : row))).toThrow('100%');
    expect(() => serializeRubric(DEFAULT_CRITERIA.map((row, i) => i === 0 ? { ...row, weight: 39.5 } : row))).toThrow('whole percentage');
    expect(() => serializeRubric(DEFAULT_CRITERIA.map((row) => ({ ...row, id: 'same' })))).toThrow('unique');
  });
  it('requires two to four meaningful criteria', () => {
    expect(() => serializeRubric(DEFAULT_CRITERIA.slice(0, 1))).toThrow('2–4');
    expect(() => serializeRubric(DEFAULT_CRITERIA.map((row) => ({ ...row, description: 'short' })))).toThrow('description');
  });
});

describe('wallet and error presentation', () => {
  const address = '0x788432Aa8D55c81c3bd2ef0FbB29A4Bc7E6e4cC6';

  it('validates and compares addresses without case sensitivity', () => {
    expect(isAddress(address)).toBe(true);
    expect(sameAddress(address, address.toLowerCase())).toBe(true);
    expect(shortAddress(address)).toBe('0x7884…4cC6');
  });

  it('removes contract error categories before showing the user', () => {
    expect(friendlyError(new Error('[EXPECTED] submission deadline is too soon'))).toBe('submission deadline is too soon');
  });
});

describe('repository proof preparation', () => {
  const wallet = '0x1111111111111111111111111111111111111111';
  const contract = '0x2222222222222222222222222222222222222222';
  const url = 'https://github.com/Owner/Repo/blob/main/docs/evidence.txt';
  it('binds the wallet, event, contract, repository and file', () => {
    expect(evidenceChallenge(contract, 'hj-1', wallet, url)).toBe(`HJ-PROVENANCE-V1|studionet|${contract}|hj-1|${wallet}|owner/repo|docs/evidence.txt|submission|none`);
    expect(evidenceChallenge(contract, 'hj-1', wallet, url, 'a'.repeat(64))).toContain(`|appeal|${'a'.repeat(64)}`);
  });
  it('rejects misleading hosts, traversal and non-file evidence', () => {
    for (const bad of [url.replace('github.com', 'github.com.evil.example'), url.replace('docs/', '../'), 'https://github.com/Owner/Repo/issues/1']) {
      expect(() => evidenceChallenge(contract, 'hj-1', wallet, bad)).toThrow('GitHub .txt');
    }
  });
});
