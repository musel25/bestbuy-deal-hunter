import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../src/report.js';

test('report separates unverified minima and unavailable prices from verified deals',()=>{
  const result={startedAt:'2026-11-06',queries:['asus laptop'],regions:[{name:'Otay Ranch',zip:'91915'}],limits:{pages:2,verifyLimit:8},coverage:[{region:'Otay Ranch',query:'asus laptop',page:1,complete:false,priced:3,total:24}],offers:[{name:'G14 | <sale>',status:'verified',buyNew:2299.99,price:1015.99,discount:55.82633,regionName:'Otay Ranch',pickupStore:'Culver City',condition:'fair',url:'https://www.bestbuy.com/product/g14/test'}],candidates:[{name:'Unknown',status:'advertised',minimum:500,regionName:'Hawthorne'}],errors:[],cleanup:{restoredPreferred:true}};
  const report=renderReport(result);
  assert.match(report,/Incomplete/);
  assert.match(report,/55\.83%/);
  assert.match(report,/Advertised minima/);
  assert.match(report,/Culver City/);
  assert.ok(!report.includes('<sale>'));
  assert.match(report,/G14 &#124;/);
});
