// These functions are serialized into the browser. Keep each one self-contained.
export function applyRegionPreferences({storeId,zip}) {
  if(!/^\d+$/.test(storeId)||!/^\d{5}$/.test(zip))throw new Error('Invalid store ID or ZIP');
  // Location preferences only. Authentication data is neither read nor exported.
  for(const [name,value]of [['locStoreId',storeId],['locDestZip',zip]]) {
    document.cookie=`${name}=${value}; Domain=.bestbuy.com; Path=/; Secure; SameSite=Lax`;
  }
  return true;
}

export function openBuyingOptions() {
  const control=document.querySelector('[data-testid="more-buying-options-main-value-prop-button"]');
  if(!control)return false;
  control.scrollIntoView?.({block:'center'});
  control.click();return true;
}

export function extractPage() {
  const text=e=>e?.innerText ?? e?.textContent ?? '';
  const amount=s=>{const m=String(s).match(/\$([\d,]+\.\d{2})/);return m?Number(m[1].replaceAll(',','')):null;};
  const storeButton=document.querySelector('button[aria-label^="Your Store:"]');
  const store=storeButton?.getAttribute('aria-label')?.replace(/^Your Store:\s*/,'')??null;
  const zipLink=[...document.querySelectorAll('a')].find(a=>/^\d{5}$/.test(text(a).trim()));
  const cards=[...document.querySelectorAll('.product-list-item[data-product-id]')].map(card=>{
    const heading=card.querySelector('h3');
    const link=heading?.closest('a')??heading?.querySelector('a');
    const href=link?.getAttribute('href');
    const url=href?new URL(href,'https://www.bestbuy.com').href:null;
    return {
      name:text(heading),productId:card.getAttribute('data-product-id'),
      sku:url?.match(/\/sku\/(\d+)(?:\/|$|\?)/)?.[1]??null,url,
      current:amount(text(card.querySelector('[data-testid="price-block-customer-price"]'))),
      comparable:amount(text(card.querySelector('[data-testid="price-block-regular-price"]'))),
      minimum:amount(text(card).match(/More options from\s*\$[\d,]+\.\d{2}/i)?.[0]??''),
      hasOptions:/More options from/i.test(text(card)),
    };
  });
  const next=[...document.querySelectorAll('a')].find(a=>/^(?:Next|Next Page|Go to next page)$/i.test((a.getAttribute('aria-label')||text(a)).trim()));
  const nextHref=next?.getAttribute('href');
  return {store,zip:zipLink?text(zipLink).trim():null,page:typeof location==='undefined'?1:Number(new URLSearchParams(location.search).get('cp')??1),cards,pricedCards:cards.filter(c=>c.current!==null).length,
    nextUrl:nextHref?new URL(nextHref,'https://www.bestbuy.com').href:null,
    noResults:/No results found|Sorry, there are no results/i.test(text(document.querySelector('main'))),
  };
}

export function extractOffer() {
  const text=e=>e?.innerText??e?.textContent??'';
  const main=document.querySelector('main')??document.body;
  const panel=document.querySelector('aside,[role="complementary"]');
  const t=text(panel??main);
  const heading=text(main.querySelector('h1'))||document.title||'';
  const amount=s=>{const m=String(s??'').match(/\$([\d,]+\.\d{2})/);return m?Number(m[1].replaceAll(',','')):null;};
  const selected=t.match(/Open[- ]Box\s+(Excellent|Good|Fair)\s*\$([\d,]+\.\d{2})/i);
  const buyNew=t.match(/Buy New:\s*\$([\d,]+\.\d{2})/i);
  const sku=text(main).match(/SKU:\s*(\d+)/)?.[1]??null;
  const pickupStore=t.match(/Pickup at\s+([^\n]+)/i)?.[1]?.trim()??null;
  const fulfillment=t.match(/Pickup\s*[–-]\s*FREE[\s\S]*?(?=Protect your|Finance options|More options from|$)/i)?.[0]?.trim().slice(0,900)??null;
  const shipping=/Shipping\s+Unavailable/i.test(t)?'unavailable':null;
  const store=document.querySelector('button[aria-label^="Your Store:"]')?.getAttribute('aria-label')?.replace(/^Your Store:\s*/,'')??null;
  const newLink=[...main.querySelectorAll('a')].find(a=>/Buy New/i.test(text(a))||(/\/sku\/\d+$/.test(a.getAttribute('href')??'')&&amount(text(a))));
  return {name:heading,sku,store,buyNew:buyNew?Number(buyNew[1].replaceAll(',','')):null,
    price:selected?Number(selected[2].replaceAll(',','')):null,condition:selected?.[1]?.toLowerCase()??null,
    seller:/Sold by\s*Best Buy/i.test(text(main))?'Best Buy':null,pickupStore,shipping,fulfillment,
    available:!!pickupStore&&/Ready|Only \d+ left/i.test(fulfillment??''),
    newUrl:newLink?.getAttribute('href')??null,
    conditionButtons:[...document.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')||text(b)).filter(s=>/^(Excellent|Good|Fair)( selected)?$/.test(s)),
  };
}
