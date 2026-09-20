import test from "node:test";
import assert from "node:assert/strict";
import {receiptOutcome} from "../lib/sponsorproof.ts";

const leader=(ok)=>({execution_result:ok?"SUCCESS":"ERROR",result:{status:ok?"return":"rollback"}});
const studio=(ok)=>({status:7,status_name:"FINALIZED",result_name:"MAJORITY_AGREE",consensus_data:{leader_receipt:[leader(ok),leader(ok)]}});

test("StudioNet finalized successful execution is recognized",()=>assert.equal(receiptOutcome(studio(true)),"success"));
test("StudioNet finalized rollback is rejected, even with MAJORITY_AGREE",()=>assert.equal(receiptOutcome(studio(false)),"rejected"));
test("StudioNet single leader receipt is supported",()=>assert.equal(receiptOutcome({...studio(true),consensus_data:{leader_receipt:leader(true)}}),"success"));
test("normalized SDK success is supported",()=>assert.equal(receiptOutcome({statusName:"FINALIZED",txExecutionResultName:"FINISHED_WITH_RETURN"}),"success"));
test("normalized SDK execution error is rejected",()=>assert.equal(receiptOutcome({statusName:"FINALIZED",txExecutionResultName:"FINISHED_WITH_ERROR"}),"rejected"));
test("pending and accepted receipts never establish success",()=>{for(const status_name of ["PENDING","ACCEPTED","PROPOSING"]){assert.throws(()=>receiptOutcome({...studio(true),status_name}),/Still pending/);}});
test("missing finality or missing execution fails closed",()=>{for(const r of [null,{}, {status:7}, {status_name:"FINALIZED",result_name:"MAJORITY_AGREE"}, {...studio(true),consensus_data:{leader_receipt:[]}}])assert.throws(()=>receiptOutcome(r),/unavailable/);});
test("conflicting lifecycle fields fail closed",()=>assert.throws(()=>receiptOutcome({...studio(true),statusName:"PENDING"}),/inconsistent/));
test("conflicting leader outcomes fail closed",()=>assert.throws(()=>receiptOutcome({...studio(true),consensus_data:{leader_receipt:[leader(true),leader(false)]}}),/inconsistent/));
test("conflicting SDK and StudioNet execution fields fail closed",()=>assert.throws(()=>receiptOutcome({...studio(false),txExecutionResultName:"FINISHED_WITH_RETURN"}),/inconsistent/));
test("unknown and contradictory execution details fail closed",()=>{for(const item of [{execution_result:"UNKNOWN"},{execution_result:"SUCCESS",result:{status:"rollback"}},null])assert.throws(()=>receiptOutcome({...studio(true),consensus_data:{leader_receipt:[item]}}),/unavailable/);});
test("explicit cancellation is not successful execution",()=>assert.equal(receiptOutcome({status_name:"CANCELED"}),"rejected"));
