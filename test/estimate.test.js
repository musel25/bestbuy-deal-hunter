import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateRuntime } from '../src/estimate.js';
import { execFileSync } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('default estimate counts all three regions and each selected condition',()=>{
  const estimate=estimateRuntime({queryCount:4,regionCount:3,pages:2,verifyLimit:8,conditionLimit:3});
  assert.equal(estimate.searchPages,24);
  assert.equal(estimate.productsToVerify,24);
  assert.equal(estimate.conditionPages,72);
  assert.equal(estimate.minMinutes,12);
  assert.equal(estimate.maxMinutes,24);
});

test('a small one-model search has a shorter estimate without excluding a region',()=>{
  const estimate=estimateRuntime({queryCount:1,regionCount:3,pages:1,verifyLimit:1,conditionLimit:3});
  assert.equal(estimate.searchPages,3);
  assert.equal(estimate.minMinutes,2);
  assert.equal(estimate.maxMinutes,4);
});

test('more search terms increase discovery time without multiplying the region verification cap',()=>{
  const estimate=estimateRuntime({queryCount:34,regionCount:3,pages:2,verifyLimit:8,conditionLimit:3});
  assert.equal(estimate.searchPages,204);
  assert.equal(estimate.productsToVerify,24);
  assert.equal(estimate.minMinutes,36);
  assert.equal(estimate.maxMinutes,69);
});

test('invalid counts cannot produce a misleading time estimate',()=>{
  assert.throws(()=>estimateRuntime({queryCount:NaN,regionCount:3,pages:2,verifyLimit:8,conditionLimit:3}));
});

test('CLI can estimate a three-region run without connecting to Chrome',()=>{
  const output=execFileSync(process.execPath,['src/cli.js','scan','--estimate','--query','legion tower','--pages','1','--verify','1','--endpoint','http://127.0.0.1:1/mcp'],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:5000});
  const plan=JSON.parse(output);
  assert.equal(plan.regions.length,3);
  assert.equal(plan.estimate.searchPages,3);
  assert.equal(plan.estimate.minMinutes,2);
  assert.equal(plan.estimate.maxMinutes,4);
});

test('a real scan reads the latest rotation state after acquiring its lock',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'bestbuy-rotation-'));
  const root=fileURLToPath(new URL('../',import.meta.url));
  try {
    await Promise.all(['src','config','package.json'].map(name=>cp(join(root,name),join(directory,name),{recursive:true})));
    await symlink(join(root,'node_modules'),join(directory,'node_modules'),'dir');
    await mkdir(join(directory,'results'));
    await writeFile(join(directory,'results/state.json'),' {"cursor":0}');
    // Simulate another scan finishing immediately before this scan acquires its lock.
    const preload=join(directory,'lock-race.mjs');
    await writeFile(preload,`import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const actualOpen=fs.promises.open;
fs.promises.open=async function(filename,...args){
  if(String(filename).endsWith('/.scan.lock'))await fs.promises.writeFile(new URL('./results/state.json',import.meta.url),'{"cursor":1}');
  return actualOpen.call(this,filename,...args);
};
syncBuiltinESMExports();\n`);
    const child=spawnSync(process.execPath,['--import',preload,'src/cli.js','scan','--endpoint','http://127.0.0.1:1/mcp'],{cwd:directory,encoding:'utf8',timeout:5000});
    assert.equal(child.status,2,child.stderr);
    assert.equal(JSON.parse(await readFile(join(directory,'results/state.json'),'utf8')).cursor,2);
  }finally{await rm(directory,{recursive:true,force:true});}
});
