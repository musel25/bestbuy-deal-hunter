import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { extractPage, extractOffer, applyRegionPreferences, openBuyingOptions, extractRetailOfferPaths } from '../src/browser.js';

function withDocument(html, fn) {
  const { document }=parseHTML(html);
  const previous=globalThis.document;
  globalThis.document=document;
  try {return fn();} finally {globalThis.document=previous;}
}

test('read advertised minimum separately from the selected listing price', () => {
  const result=withDocument(`<html><body><button aria-label="Your Store: Otay Ranch">Otay Ranch</button><a data-testid="shipping-zip">91915</a><div class="product-list-item" data-product-id="12974438"><a href="https://www.bestbuy.com/product/g14/JJGGLH72GT"><h3>ASUS G14</h3></a><div data-testid="price-block-customer-price">$2,034.00</div><div data-testid="price-block-regular-price">Comp. Value: $2,299.99</div><a>More options from $1,015.99</a></div></body></html>`, extractPage);
  assert.equal(result.store,'Otay Ranch');
  assert.equal(result.cards[0].minimum,1015.99);
  assert.equal(result.cards[0].current,2034);
  assert.equal(result.cards[0].comparable,2299.99);
  assert.equal(result.cards[0].sku,null);
});

test('missing card prices remain incomplete instead of becoming zero', () => {
  const result=withDocument('<html><body><div class="product-list-item" data-product-id="1"><h3>G14</h3></div></body></html>',extractPage);
  assert.equal(result.cards[0].current,null);
  assert.equal(result.cards[0].minimum,null);
  assert.equal(result.pricedCards,0);
});

test('open the buying-options control even when Best Buy uses a div',()=>{
  withDocument('<html><body><aside><div data-testid="more-buying-options-main-value-prop-button">New and Open-Box</div></aside></body></html>',()=>{
    let opened=false;
    document.querySelector('div').addEventListener('click',()=>{opened=true;});
    assert.equal(openBuyingOptions(),true);
    assert.equal(opened,true);
  });
});

test('recover the retail SKU from the buying sheet even when only new offers are shown',()=>{
  const paths=withDocument(`<html><body><div data-testid="more-buying-options-sheet-content-container-content"><div data-testid="more-buying-options-sku-condition-card">New<br>Sold by<br><button data-testid="mbo-add-to-cart-6629420">Add to cart</button></div><div data-testid="more-buying-options-sku-condition-card">New<br>Sold &amp; shipped by<br>PC Heaven<button data-testid="mbo-add-to-cart-12974438">Add to cart</button></div></div></body></html>`,()=>extractRetailOfferPaths('/product/g14/JJGGLH72GT'));
  assert.equal(paths.length,3);
  assert.equal(paths[0].path,'/product/g14/JJGGLH72GT/sku/6629420/openbox');
  assert.deepEqual(paths.map(p=>p.condition),['fair','good','excellent']);
});

test('location preferences only change the store and destination ZIP',()=>{
  withDocument('<html><body></body></html>',()=>{
    const writes=[];
    Object.defineProperty(document,'cookie',{set:value=>writes.push(value),configurable:true});
    applyRegionPreferences({storeId:'104',zip:'90250'});
    assert.equal(writes.length,2);
    assert.ok(writes[0].startsWith('locStoreId=104;'));
    assert.ok(writes[1].startsWith('locDestZip=90250;'));
    assert.throws(()=>applyRegionPreferences({storeId:'104; other=value',zip:'90250'}),/Invalid/);
    assert.equal(writes.length,2);
  });
});

test('verify Buy New and Fair price from purchase panel without recommendation prices', () => {
  const result=withDocument(`<html><body><button aria-label="Your Store: Hawthorne"></button><main><h1>ASUS G14 - Open Box - Fair</h1><p>SKU: 6629420</p><p>Sold by<br>Best Buy</p><aside><p>Open-Box Fair<br>$1,015.99<br>Save $1,284<br>Buy New:<br>$2,299.99</p><p>Pickup – FREE<br>Today nearby<br>Shipping<br>Unavailable<br>Not available at Hawthorne<br>Pickup at Culver City<br>Only 1 left!<br>Check other locations</p></aside></main><p>Sponsored $99.99</p></body></html>`,extractOffer);
  assert.equal(result.buyNew,2299.99);
  assert.equal(result.price,1015.99);
  assert.equal(result.sku,'6629420');
  assert.equal(result.condition,'fair');
  assert.equal(result.pickupStore,'Culver City');
  assert.equal(result.shipping,'unavailable');
});

test('retain an explicit unavailable open-box price without claiming inventory',()=>{
  const result=withDocument('<html><body><button aria-label="Your Store: Otay Ranch"></button><main><h1>G14 Open Box</h1><p>SKU: 6629420</p><p>Sold by<br>Best Buy</p><aside>Open-Box Fair<br>$1,015.99<br>Buy New:<br>$2,299.99<br>Unavailable<br>Sold by<br>Return &amp; Exchange Policy</aside></main></body></html>',extractOffer);
  assert.equal(result.fulfillment,'Unavailable');
  assert.equal(result.available,false);
  assert.equal(result.price,1015.99);
});
