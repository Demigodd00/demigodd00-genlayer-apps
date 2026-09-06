import { describe, expect, it } from 'vitest';
import { evidenceChallenge, formatGen, friendlyError, isAddress, parseGen, sameAddress, shortAddress } from '../lib/protocol';

describe('protocol value formatting', () => {
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
