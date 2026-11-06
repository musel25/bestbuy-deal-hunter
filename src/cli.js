#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from './chrome.js';
import { scan } from './scanner.js';
import { selectQueries } from './domain.js';
import { renderReport } from './report.js';
import { extractPage, extractOffer } from './browser.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const {values,positionals}=parseArgs({allowPositionals:true,options:{
  help:{type:'boolean',short:'h'},query:{type:'string',multiple:true},all:{type:'boolean'},pages:{type:'string'},
  verify:{type:'string'},timeout:{type:'string'},region:{type:'string',multiple:true},match:{type:'string'},
  'no-block':{type:'boolean'},'extension-id':{type:'string'},endpoint:{type:'string'},tab:{type:'string'},
}});
const command=positionals[0]??'scan';
if(values.help) {
  console.log(`Best Buy Deal Hunter

node src/cli.js scan                 Rotate laptop and desktop queries; search all three regions
node src/cli.js scan --query "asus laptop" --query "legion tower"
node src/cli.js smoke                Find the G14 example in all three regions
node src/cli.js inspect --tab ID     Read product data from one existing tab without navigation

Options:
  --all                 Search the full configured pool
  --pages N             Pages per query and region (default: 2)
  --verify N            Products to verify per region (default: 8)
  --timeout MS          Page-data timeout (default: 30000)
  --region ID           Explicit region subset; repeatable (default: all three)
  --match TEXT          Keep candidate names containing this text
  --no-block            Load images, fonts, and video normally
  --extension-id ID     Chrome MCP extension ID; normally found from native-host manifest
  --endpoint URL        Chrome MCP HTTP endpoint

Chrome must be open with Chrome MCP connected. Reports are saved in results/.
The scan changes Best Buy's preferred store temporarily and restores Otay Ranch.
No website filters are applied. Limits and incomplete data are recorded.`);
  process.exit(0);
}
const config=JSON.parse(await readFile(join(root,'config/search.json'),'utf8'));
const endpoint=values.endpoint??process.env.CHROME_MCP_URL??'http://127.0.0.1:12306/mcp';
if(command==='inspect') {
  if(!/^\d+$/.test(values.tab??''))throw new Error('inspect requires --tab ID');
  const chrome=new Chrome(endpoint);
  try {await chrome.connect();chrome.tabId=Number(values.tab);console.log(JSON.stringify({search:await chrome.evaluate(extractPage),product:await chrome.evaluate(extractOffer)},null,2));}
  finally{await chrome.close();}
  process.exit(0);
}
if(!['scan','smoke'].includes(command))throw new Error('Use scan, smoke, or inspect');
const positive=(name,fallback)=>{
  const n=values[name]===undefined?fallback:Number(values[name]);
  if(!Number.isInteger(n)||n<1)throw new Error(`--${name} must be a positive integer`);
  return n;
};
const regions=values.region?config.regions.filter(r=>values.region.includes(r.id)):config.regions;
if(!regions.length||values.region?.some(id=>!config.regions.some(r=>r.id===id)))throw new Error('Unknown --region; use otay-ranch, costa-mesa, or hawthorne');
const directory=resolve(root,'results');
await mkdir(directory,{recursive:true});
const lockPath=join(directory,'.scan.lock');
let lock;
try {lock=await open(lockPath,'wx');await lock.writeFile(`${process.pid}\n`);}
catch{throw new Error('Another scan may be running. Check results/.scan.lock before removing a stale lock.');}
try {
  let state={cursor:0};
  try{state=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));}catch{/* first run */}
  let extensionId=values['extension-id']??process.env.CHROME_MCP_EXTENSION_ID;
  if(!extensionId&&!values['no-block']) {
    try{const manifest=JSON.parse(await readFile(join(homedir(),'.config/google-chrome/NativeMessagingHosts/com.chromemcp.nativehost.json'),'utf8'));extensionId=manifest.allowed_origins?.[0]?.match(/^chrome-extension:\/\/([a-p]{32})\/$/)?.[1];}catch{/* optional optimization */}
  }
  const queries=command==='smoke'?[config.smoke.query]:values.query??(values.all?Object.values(config.pool).flat():selectQueries(config.pool,state.cursor,config.defaults.queriesPerType));
  const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
  const filename=join(directory,`${stamp}-${command}`);
  let stop=false;
  const interrupt=()=>{stop=true;console.error('Stopping after the current browser operation. Restoring Otay Ranch.');};
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  const save=async result=>{
    await writeFile(`${filename}.json`,JSON.stringify(result,null,2)+'\n');
    await writeFile(`${filename}.md`,renderReport(result));
  };
  const result=await scan({...config.defaults,endpoint,allRegions:config.regions,regions,queries,
    extensionId:values['no-block']?undefined:extensionId,pages:positive('pages',config.defaults.pages),
    verifyLimit:positive('verify',command==='smoke'?1:config.defaults.verifyLimit),pageTimeoutMs:positive('timeout',config.defaults.pageTimeoutMs),
    match:values.match??(command==='smoke'?config.smoke.match:undefined),save,log:message=>console.error(message),shouldStop:()=>stop});
  process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  if(command==='scan'&&!values.query&&!values.all)await writeFile(join(directory,'state.json'),JSON.stringify({cursor:state.cursor+1})+'\n');
  const summary={report:`${filename}.md`,data:`${filename}.json`,coverage:result.coverage.map(c=>({region:c.region,page:c.page,priced:c.priced,total:c.total,complete:c.complete,reason:c.reason})),candidates:result.candidates.length,offers:result.offers.map(o=>({region:o.regionName,status:o.status,price:o.price,buyNew:o.buyNew,discount:o.discount,condition:o.condition,pickup:o.pickupStore,reason:o.reason})),errors:result.errors,cleanup:result.cleanup,resourceBlocking:result.resourceBlocking};
  console.log(JSON.stringify(summary,null,2));
  if(result.errors.length||result.coverage.some(c=>!c.complete))process.exitCode=2;
}finally{await lock.close();await unlink(lockPath);}
