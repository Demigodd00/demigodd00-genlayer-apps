import { describe, expect, it } from 'vitest';
import { formatGen, friendlyError, isAddress, parseGen, sameAddress, shortAddress } from '../lib/protocol';

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
