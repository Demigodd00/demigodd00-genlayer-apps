import { chains, createClient } from "genlayer-js";
import { ExecutionResult, TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
export const ADDRESS="0x0235c7f7E646bA26532587aFED3108148C92Ef2f" as const;
export const EXPLORER=`https://explorer-studio.genlayer.com/address/${ADDRESS}`;
export const REPO="https://github.com/Demigodd00/demigodd00-genlayer-apps";
export type Commitment={id:string;title:string;requirement:string;url:string;weight:number};
export type Decision={phase:string;at:number;digest:string;parent_digest:string;decision:{commitments:{id:string;outcome:string;reason:string;refs:{line:number;excerpt:string}[]}[]}};
export type Summary={id:string;title:string;sponsor:string;organizer:string;status:string;budget_atto:string;deadline:number};
export type Campaign=Summary&{terms_digest:string;review_seconds:number;review_deadline:number;hard_deadline:number;commitments:Commitment[];evidence:Record<string,{text:string;url:string;sha256:string;package_digest:string;captured_at:number}>;seals:string[];appeals:Record<string,string>;history:Decision[];funded:boolean;allocated:boolean;organizer_allocation:string;sponsor_allocation:string;held_atto:string;resolution?:string;split_proposal:null|{proposer:string;organizer_atto:string;digest:string}};
type Listener=(...args:unknown[])=>void;
type Provider={request(input:{method:string;params?:unknown[]}):Promise<unknown>;on?(event:string,fn:Listener):void;removeListener?(event:string,fn:Listener):void};
declare global{interface Window{ethereum?:Provider}}
export type Wallet={address:`0x${string}`;provider:Provider;client:ReturnType<typeof createClient>};
const reader=createClient({chain:chains.studionet});
export const validAddress=(v:string):v is `0x${string}`=>/^0x[0-9a-fA-F]{40}$/.test(v)&&!/^0x0{40}$/.test(v);
export const same=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
export const short=(a:string)=>`${a.slice(0,6)}…${a.slice(-4)}`;
export const errorText=(e:unknown)=>e instanceof Error?e.message.slice(0,700):"Request failed. A submitted transaction may still be pending.";
export function atto(v:string){if(!/^\d+(\.\d{1,18})?$/.test(v))throw new Error("Use a GEN amount with at most 18 decimals.");const[w,f=""]=v.split(".");return BigInt(w)*10n**18n+BigInt(f.padEnd(18,"0"));}
export function gen(v:string){const n=BigInt(v),f=(n%10n**18n).toString().padStart(18,"0").replace(/0+$/,"");return (n/10n**18n).toString()+(f?"."+f:"");}
export async function read<T>(functionName:string,args:unknown[]=[]):Promise<T>{return await reader.readContract({address:ADDRESS,functionName,args:args as never[],transactionHashVariant:TransactionHashVariant.LATEST_FINAL}) as T;}
export const list=(offset=0)=>read<{items:Summary[];total:string}>("list_campaigns",[offset,20]);
export const campaign=(id:string)=>read<Campaign>("get_campaign",[id]);
export const credit=(address:string)=>read<string>("get_credit",[address]);
export async function checkWallet(w:Wallet){const a=await w.provider.request({method:"eth_accounts"}),n=await w.provider.request({method:"eth_chainId"});if(!Array.isArray(a)||!same(a[0],w.address))throw new Error("Wallet changed; reconnect.");if(BigInt(String(n))!==BigInt(chains.studionet.id))throw new Error("Switch to GenLayer StudioNet.");}
export async function connect():Promise<Wallet>{const p=window.ethereum;if(!p)throw new Error("Install an injected wallet such as MetaMask to sign. Viewing needs no wallet.");const a=await p.request({method:"eth_requestAccounts"});if(!Array.isArray(a)||!validAddress(a[0]))throw new Error("No valid wallet account.");const w={address:a[0],provider:p,client:createClient({chain:chains.studionet,account:a[0],provider:p as never})};await w.client.connect("studionet");await checkWallet(w);return w;}
export async function submit(w:Wallet,method:string,args:unknown[],value:bigint){await checkWallet(w);return String(await w.client.writeContract({address:ADDRESS,functionName:method,args:args as never[],value}));}
export async function receipt(hash:string):Promise<"success"|"rejected">{const r=await reader.waitForTransactionReceipt({hash:hash as never,status:TransactionStatus.FINALIZED,retries:30});if(r.statusName!==TransactionStatus.FINALIZED)throw new Error("Still pending; check this receipt again instead of resubmitting.");if(r.txExecutionResultName===ExecutionResult.FINISHED_WITH_ERROR)return "rejected";if(r.txExecutionResultName!==ExecutionResult.FINISHED_WITH_RETURN)throw new Error("Execution outcome is unavailable; check the receipt again.");return "success";}
