import test from "node:test";
import assert from "node:assert/strict";
import {atto,gen,validAddress,same,ADDRESS} from "../lib/sponsorproof.ts";
test("GEN parsing preserves all 18 decimal places",()=>{assert.equal(atto("0.000000000000000001"),1n);assert.equal(atto("0.001"),10n**15n);assert.equal(atto("1000"),1000n*10n**18n);});
test("invalid amount formats fail before a signature",()=>{for(const n of ["-1","1e18","NaN","0.0000000000000000001","1.2.3",""])assert.throws(()=>atto(n));});
test("formatting preserves exact allocations without floating point",()=>{for(const n of [1n,10n**15n+3n,10n**18n,1000n*10n**18n])assert.equal(atto(gen(n.toString())),n);});
test("wallet checks reject malformed and zero addresses",()=>{assert.ok(validAddress(ADDRESS));assert.ok(same(ADDRESS,ADDRESS.toLowerCase()));assert.ok(!validAddress("0x"+"0".repeat(40)));assert.ok(!validAddress("0x123"));assert.ok(!same(undefined,undefined));});
