import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { extractPage, extractOffer, fillInput } from '../src/browser.js';

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

test('ZIP input changes notify the application before the form is submitted',()=>{
  withDocument('<html><body><form><input id="zip" value="90703"></form></body></html>',()=>{
    let applicationValue='90703';
    const input=document.querySelector('#zip');
    input.addEventListener('input',()=>{applicationValue=input.value;});
    fillInput({selector:'#zip',value:'91915'});
    assert.equal(applicationValue,'91915');
    assert.equal(input.value,'91915');
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
