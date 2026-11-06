import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLocation, pageCoverage, classifyOffer, verifyNextUrl, mergePageSnapshots } from '../src/scanner.js';
import { Chrome, decodeToolResult } from '../src/chrome.js';
import { runInNewContext } from 'node:vm';

const region={id:'otay-ranch',name:'Otay Ranch',zip:'91915'};

test('fail closed on a mismatched store or ZIP',()=>{
  assert.throws(()=>validateLocation({store:'Cerritos',zip:'91915'},region),/store/i);
  assert.throws(()=>validateLocation({store:'Otay Ranch',zip:'92173'},region),/ZIP/i);
  assert.throws(()=>validateLocation({store:'Otay Ranch',zip:null},region),/ZIP/i);
  assert.doesNotThrow(()=>validateLocation({store:'Otay Ranch',zip:'91915'},region));
});

test('missing or partially loaded cards cannot be a complete page',()=>{
  assert.equal(pageCoverage({cards:[{current:100},{current:null}],pricedCards:1}).complete,false);
  assert.equal(pageCoverage({cards:[],pricedCards:0,noResults:false}).complete,false);
  assert.equal(pageCoverage({cards:[],pricedCards:0,noResults:true}).complete,true);
});

test('keep prices from cards that the website unloads after scrolling',()=>{
  const first={cards:[{productId:'a',name:'A',current:100,minimum:40,hasOptions:true},{productId:'b',name:'',current:null,minimum:null}],pricedCards:1};
  const next={cards:[{productId:'a',name:'',current:null,minimum:null,hasOptions:false},{productId:'b',name:'B',current:200,minimum:90,hasOptions:true}],pricedCards:1};
  const merged=mergePageSnapshots(first,next);
  assert.equal(merged.pricedCards,2);
  assert.equal(merged.cards[0].minimum,40);
  assert.equal(merged.cards[0].name,'A');
  assert.equal(pageCoverage(merged).complete,true);
});

test('a verified discount requires Buy New, matching SKU, seller, and selected price',()=>{
  const candidate={sku:'6629420',minimum:1015.99};
  const offer={sku:'6629420',seller:'Best Buy',buyNew:2299.99,price:1015.99,condition:'fair',available:true,pickupStore:'Culver City'};
  assert.equal(classifyOffer(candidate,offer).status,'verified');
  assert.equal(classifyOffer(candidate,{...offer,buyNew:null}).status,'unverified');
  assert.equal(classifyOffer(candidate,{...offer,sku:'1234'}).status,'unverified');
  assert.equal(classifyOffer(candidate,{...offer,available:false}).status,'price-only');
  assert.equal(classifyOffer(candidate,{...offer,seller:null}).status,'unverified');
});

test('pagination rejects filters, different terms, and external URLs',()=>{
  assert.equal(verifyNextUrl('https://www.bestbuy.com/site/searchpage.jsp?st=asus+laptop&cp=2','asus laptop'),true);
  assert.equal(verifyNextUrl('https://www.bestbuy.com/site/searchpage.jsp?st=asus+laptop&qp=condition~Open-Box','asus laptop'),false);
  assert.equal(verifyNextUrl('https://example.com/site/searchpage.jsp?st=asus+laptop','asus laptop'),false);
  assert.equal(verifyNextUrl('https://www.bestbuy.com/site/searchpage.jsp?st=g14','asus laptop'),false);
});

test('decode MCP results without treating tool errors or malformed output as empty data',()=>{
  assert.deepEqual(decodeToolResult({content:[{type:'text',text:JSON.stringify({success:true,result:JSON.stringify({cards:[]})})}]}),{cards:[]});
  assert.throws(()=>decodeToolResult({isError:true,content:[{type:'text',text:'failed'}]}));
  assert.throws(()=>decodeToolResult({content:[{type:'text',text:'not json'}]}));
  assert.equal(decodeToolResult({content:[{type:'text',text:JSON.stringify({success:true,result:'visible'})}]}),'visible');
});

test('scan tab creation refuses an existing user tab and never owns it',async()=>{
  const chrome=new Chrome();
  chrome.call=async name=>name==='get_windows_and_tabs'?{windows:[{tabs:[{tabId:77}]}]}:{tabId:77};
  await assert.rejects(chrome.createTab('https://www.bestbuy.com/'),/existing/i);
  assert.deepEqual(chrome.ownedTabs,[]);
});

test('blank scan tab uses an HTTP URL supported by Chrome MCP',async()=>{
  const chrome=new Chrome();
  chrome.call=async(name,args)=>{
    if(name==='get_windows_and_tabs')return {windows:[]};
    if(!args.url.startsWith('https://'))throw new Error('Invalid url pattern');
    return {tabId:88};
  };
  assert.equal(await chrome.createTab('about:blank'),88);
  assert.deepEqual(chrome.ownedTabs,[88]);
});

test('navigation uses the native tab update when background page timers are suspended',async()=>{
  const chrome=new Chrome();chrome.tabId=88;
  let navigated=false;
  chrome.call=async(name,args)=>{if(name==='chrome_navigate'&&args.tabId===88&&args.url==='https://www.bestbuy.com/site/store-locator')navigated=true;return {};};
  chrome.evaluate=async()=>navigated;
  chrome.wait=async read=>{if(!await read())throw new Error('Navigation did not start');};
  await chrome.go('https://www.bestbuy.com/site/store-locator');
});

test('background evaluation uses the extension helper without a second debugger connection',async()=>{
  const chrome=new Chrome();chrome.tabId=88;chrome.helperTab=99;chrome.debugTabId=88;
  chrome.call=async(name,{tabId,code})=>{
    assert.equal(tabId,99);
    const extension={debugger:{sendCommand:async(target,method,params)=>{
      assert.equal(target.tabId,88);assert.equal(method,'Runtime.evaluate');
      return {result:{value:await runInNewContext(params.expression)}};
    }}};
    return new Function('chrome',`return (async()=>{${code}})()`)(extension);
  };
  const result=await chrome.evaluate(value=>({value}),'quoted " text');
  assert.equal(result.value,'quoted " text');
});
