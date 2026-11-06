import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLocation, pageCoverage, classifyOffer, verifyNextUrl } from '../src/scanner.js';
import { decodeToolResult } from '../src/chrome.js';

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
});
