// Explicit, read-only network regression checks. No wallet, signing or new writes.
import test from "node:test";
import assert from "node:assert/strict";
import {receipt} from "../lib/sponsorproof.ts";

test("real StudioNet organizer claim is recognized as successful",{timeout:60000},async()=>{
 assert.equal(await receipt("0x0a861ad3674844849334bba5047c2cbc028861f256efda8112e703b835473a64"),"success");
});
test("real StudioNet late appeal is recognized as rejected",{timeout:60000},async()=>{
 assert.equal(await receipt("0xd095a6a3e0d8aa24bb3a9b223b5b4bf73ec11bda66ceabfa3bd08c0b01b74ac2"),"rejected");
});
