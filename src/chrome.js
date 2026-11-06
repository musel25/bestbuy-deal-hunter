import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { fillInput } from './browser.js';

export function decodeToolResult(response) {
  if(response.isError) throw new Error(response.content?.find(c=>c.type==='text')?.text??'Chrome MCP tool failed');
  const block=response.content?.find(c=>c.type==='text');
  if(!block) throw new Error('Chrome MCP returned no text');
  let data;
  try {data=JSON.parse(block.text);} catch {throw new Error('Chrome MCP returned invalid JSON');}
  if(data.success===false) throw new Error(data.error??data.message??'Chrome MCP reported failure');
  if(typeof data.result==='string') {
    try{return JSON.parse(data.result);}catch{throw new Error('Chrome MCP returned invalid JavaScript result');}
  }
  return data.result??data;
}

export class Chrome {
  constructor(endpoint='http://127.0.0.1:12306/mcp') {
    this.endpoint=endpoint;
    this.client=new Client({name:'bestbuy-deal-hunter',version:'0.1.0'},{capabilities:{}});
    this.ownedTabs=[];
  }
  async connect() {
    await this.client.connect(new StreamableHTTPClientTransport(new URL(this.endpoint)));
  }
  async call(name,args={}) {return decodeToolResult(await this.client.callTool({name,arguments:args}));}
  async evaluate(fn,argument,tabId=this.tabId) {
    const code=`return await (${fn.toString()})(${JSON.stringify(argument)??'undefined'});`;
    return this.call('chrome_javascript',{tabId,code,maxOutputBytes:50000,timeoutMs:15000});
  }
  async createTab(url) {
    // A unique fragment prevents Chrome MCP from reusing an existing user tab.
    const target=`${url}${url.includes('#')?'&':'#'}deal-hunter-${crypto.randomUUID()}`;
    const result=await this.call('chrome_navigate',{url:target,background:false});
    if(!result.tabId) throw new Error('Chrome MCP did not create a tab');
    this.ownedTabs.push(result.tabId);
    return result.tabId;
  }
  async go(url) {
    const target=new URL(url);
    if(target.origin!=='https://www.bestbuy.com') throw new Error('Refusing navigation outside Best Buy');
    // Some Chrome MCP releases activate tabId without navigating it. Use the page.
    await this.evaluate(url=>{globalThis.__dealHunterNavigating=true;setTimeout(()=>location.assign(url),0);return true;},url);
    await this.wait(()=>this.evaluate(target=>!globalThis.__dealHunterNavigating&&location.pathname===target.pathname&&new URLSearchParams(location.search).get('st')===target.term&&document.readyState!=='loading', {pathname:target.pathname,term:target.searchParams.get('st')}),15000,'navigation');
  }
  async wait(read,timeout=30000,label='page data') {
    const end=Date.now()+timeout;
    let lastError;
    while(Date.now()<end) {
      if(this.cancelled?.()) throw new Error('Search interrupted');
      try {const result=await read();if(result)return result;}catch(e){lastError=e;}
      await new Promise(resolve=>setTimeout(resolve,350));
    }
    throw new Error(`Timed out waiting for ${label}${lastError?`: ${lastError.message}`:''}`);
  }
  async fill(selector,value) {return this.evaluate(fillInput,{selector,value});}
  async blockResources(extensionId) {
    this.helperTab=await this.createTab(`chrome-extension://${extensionId}/options.html`);
    this.ruleId=90_000_000+Math.floor(Math.random()*9_000_000);
    await this.wait(()=>this.evaluate(()=>typeof chrome!=='undefined'&&!!chrome.declarativeNetRequest,undefined,this.helperTab),5000,'extension request rules');
    await this.evaluate(async ({tabId,ruleId})=>{
      await chrome.declarativeNetRequest.updateSessionRules({addRules:[{id:ruleId,priority:1,action:{type:'block'},condition:{tabIds:[tabId],resourceTypes:['image','media','font']}}]});
      return (await chrome.declarativeNetRequest.getSessionRules()).some(r=>r.id===ruleId);
    },{tabId:this.tabId,ruleId:this.ruleId},this.helperTab);
    await this.call('chrome_switch_tab',{tabId:this.tabId});
  }
  async close() {
    const errors=[];
    if(this.ruleId&&this.helperTab) {
      try {await this.evaluate(async id=>{await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[id]});return true;},this.ruleId,this.helperTab);}catch(e){errors.push(`Resource rules: ${e.message}`);}
    }
    if(this.ownedTabs.length) {
      try {await this.call('chrome_close_tabs',{tabIds:this.ownedTabs});}catch(e){errors.push(`Scan tabs: ${e.message}`);}
    }
    await this.client.close();
    return errors;
  }
}
