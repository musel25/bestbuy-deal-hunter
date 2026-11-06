import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, discountPercent, normalizeObservation, mergeObservations, searchUrl, selectQueries, rankCandidates } from '../src/domain.js';

test('parse prices without reading monthly payments or accepting invalid amounts', () => {
  assert.equal(money('$2,299.99'), 2299.99);
  assert.equal(money('More options from $1,015.99'), 1015.99);
  assert.equal(money('Unavailable'), null);
  assert.equal(discountPercent(2299.99, 1015.99), 55.826330);
  assert.equal(discountPercent(2000, 1000), 50);
  assert.equal(discountPercent(0, 10), null);
  assert.equal(discountPercent(2000, null), null);
});

test('a comparable value only creates an unverified candidate', () => {
  const item = normalizeObservation({name:'G14',productId:'12974438',url:'https://www.bestbuy.com/product/g14/JJGGLH72GT',current:2034,comparable:2299.99,minimum:1015.99}, {id:'otay-ranch',name:'Otay Ranch',zip:'91915'}, 'asus laptop');
  assert.equal(item.status, 'advertised');
  assert.equal(item.buyNew, null);
  assert.equal(item.sku, null);
  assert.equal(item.hintDiscount, 55.826330);
});

test('deduplication keeps separate region and condition observations', () => {
  const base={productKey:'JJGGLH72GT',regionId:'otay-ranch',condition:'fair',minimum:1015.99,queries:['asus laptop']};
  const items=mergeObservations([base,{...base,queries:['g14']},{...base,regionId:'costa-mesa'},{...base,condition:'good'}]);
  assert.equal(items.length,3);
  assert.deepEqual(items[0].queries,['asus laptop','g14']);
});

test('search URLs contain only the search term and page', () => {
  assert.equal(searchUrl('asus laptop',2),'https://www.bestbuy.com/site/searchpage.jsp?st=asus+laptop&cp=2');
  assert.throws(()=>searchUrl('asus',0));
});

test('rotating queries include both computer types and advance on the next run', () => {
  const pool={laptops:['asus laptop','g14'],desktops:['legion tower','omen desktop']};
  assert.deepEqual(selectQueries(pool,0,1),['asus laptop','legion tower']);
  assert.deepEqual(selectQueries(pool,1,1),['g14','omen desktop']);
});

test('premium GPU desktops get verification before cheap large-percentage discounts',()=>{
  const candidates=[{name:'Budget office desktop 8GB Memory',hintDiscount:80},{name:'Lenovo Legion Tower 5i RTX 5070 Ti 32GB DDR5 Memory',hintDiscount:50}];
  const ranked=rankCandidates(candidates,{premiumTerms:['legion tower'],gpuTargets:['RTX 5070 Ti'],desktopRamGB:32});
  assert.equal(ranked[0].name,'Lenovo Legion Tower 5i RTX 5070 Ti 32GB DDR5 Memory');
  assert.equal(ranked.length,2);
  assert.equal(candidates[0].name,'Budget office desktop 8GB Memory');
});

test('ranking keeps unknown configurations available for later inspection',()=>{
  const ranked=rankCandidates([{name:'Unknown configuration',hintDiscount:null},{name:'MSI Aegis 32GB Memory',hintDiscount:40}],{premiumTerms:['msi aegis'],desktopRamGB:32});
  assert.equal(ranked.length,2);
  assert.equal(ranked[1].name,'Unknown configuration');
});
