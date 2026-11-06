import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLocation, pageCoverage, classifyOffer, verifyNextUrl, mergePageSnapshots, confirmPageChange, matchingOpenBoxLinks, smokeAcceptance, offerReady } from '../src/scanner.js';
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

test('replaced or reordered DOM cards preserve all earlier page observations',()=>{
  const first={cards:[{productId:'a',current:100},{productId:'b',current:null}],pricedCards:1};
  const merged=mergePageSnapshots(first,{cards:[{productId:'c',current:300},{productId:'a',current:null}],pricedCards:1});
  assert.deepEqual(merged.cards.map(c=>c.productId),['a','b','c']);
  assert.equal(merged.cards[0].current,100);
  assert.equal(pageCoverage(merged).complete,false);
});

test('an advertised option without its minimum price makes coverage incomplete',()=>{
  assert.equal(pageCoverage({cards:[{current:100,hasOptions:true,minimum:null}],pricedCards:1}).complete,false);
});

test('a verified discount requires Buy New, matching SKU, seller, and selected price',()=>{
  const candidate={sku:'6629420',minimum:1015.99};
  const offer={sku:'6629420',seller:'Best Buy',buyNew:2299.99,price:1015.99,condition:'fair',available:true,pickupStore:'Culver City'};
  assert.equal(classifyOffer(candidate,offer).status,'verified');
  assert.equal(classifyOffer(candidate,{...offer,buyNew:null}).status,'unverified');
  assert.equal(classifyOffer(candidate,{...offer,sku:'1234'}).status,'unverified');
  assert.equal(classifyOffer(candidate,{...offer,available:false}).status,'price-only');
  assert.equal(classifyOffer(candidate,{...offer,seller:null}).status,'unverified');
  assert.equal(classifyOffer({...candidate,sku:null},offer).status,'unverified');
});

const completeOffer={sku:'6629420',store:'Hawthorne',price:1015.99,buyNew:2299.99,condition:'fair',seller:'Best Buy'};
test('pickup loading text is not a finished availability result',()=>{
  assert.equal(offerReady({...completeOffer,fulfillment:'Pickup Location\nSold by',available:false},15000,10000),false);
});

test('a temporary unavailable state must settle before a negative result is accepted',()=>{
  const offer={...completeOffer,fulfillment:'Unavailable',available:false};
  assert.equal(offerReady(offer,3000,2500),false);
  assert.equal(offerReady(offer,9000,300),false);
  assert.equal(offerReady(offer,9000,2500),true);
});

test('a resolved available offer can replace the loading state immediately',()=>{
  assert.equal(offerReady({...completeOffer,fulfillment:'Pickup at Culver City\nReady in 1 hour\nOnly 1 left!',pickupStore:'Culver City',available:true},5000,0),true);
  assert.equal(offerReady({...completeOffer,store:null,fulfillment:'Pickup at Culver City',available:true},5000,0),false);
});

test('pagination rejects filters, different terms, and external URLs',()=>{
  assert.equal(verifyNextUrl('https://www.bestbuy.com/site/searchpage.jsp?st=asus+laptop&cp=2','asus laptop'),true);
  assert.equal(verifyNextUrl('https://www.bestbuy.com/site/searchpage.jsp?st=asus+laptop&qp=condition~Open-Box','asus laptop'),false);
  assert.equal(verifyNextUrl('https://example.com/site/searchpage.jsp?st=asus+laptop','asus laptop'),false);
  assert.equal(verifyNextUrl('https://www.bestbuy.com/site/searchpage.jsp?st=g14','asus laptop'),false);
});

test('page transitions reject unchanged products and the wrong page number',()=>{
  const previous={page:1,cards:[{productId:'a'},{productId:'b'}]};
  assert.throws(()=>confirmPageChange(previous,{...previous,page:2},2),/unchanged/);
  assert.throws(()=>confirmPageChange(previous,{page:1,cards:[{productId:'c'}]},2),/page/i);
  assert.doesNotThrow(()=>confirmPageChange(previous,{page:2,cards:[{productId:'c'}]},2));
});

test('offer links must match the canonical product and provide the Best Buy SKU',()=>{
  const offers=[{path:'/product/g14/JJGGLH72GT/sku/6629420/openbox',condition:'fair'},{path:'/product/another/OTHERKEY/sku/1234/openbox',condition:'fair'}];
  const links=matchingOpenBoxLinks({productKey:'JJGGLH72GT'},offers);
  assert.equal(links.length,1);
  assert.equal(links[0].sku,'6629420');
  assert.equal(links[0].url,'https://www.bestbuy.com/product/g14/JJGGLH72GT/sku/6629420/openbox?condition=fair');
});

test('a smoke run must find and verify the target in each requested region',()=>{
  const checks=smokeAcceptance({regions:[{id:'otay-ranch'},{id:'hawthorne'}],candidates:[{regionId:'otay-ranch'}],offers:[{regionId:'otay-ranch',sku:'6629420',status:'price-only'}]},'6629420');
  assert.deepEqual(checks,[{regionId:'otay-ranch',found:true,verifiedPrice:true},{regionId:'hawthorne',found:false,verifiedPrice:false}]);
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

test('creating scan and helper tabs never activates Chrome',async()=>{
  const chrome=new Chrome();
  const navigations=[];
  chrome.call=async(name,args)=>{
    if(name==='get_windows_and_tabs')return {windows:[{tabs:[{tabId:77}]}]};
    navigations.push(args);
    return {tabId:88+navigations.length};
  };
  await chrome.createTab('about:blank');
  await chrome.createTab('chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html');
  assert.ok(navigations.every(args=>args.background===true));
});

test('navigation stays in the background even when the helper is unavailable',async()=>{
  const chrome=new Chrome();chrome.tabId=88;
  let navigation;
  chrome.evaluate=async()=>true;
  chrome.wait=async read=>read();
  chrome.call=async(name,args)=>{navigation=args;return {};};
  await chrome.go('https://www.bestbuy.com/site/store-locator');
  assert.equal(navigation.background,true);
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
