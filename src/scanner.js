import { Chrome } from './chrome.js';
import { extractPage, extractOffer, applyRegionPreferences, openBuyingOptions, extractRetailOfferPaths } from './browser.js';
import { discountPercent, normalizeObservation, mergeObservations, searchUrl, rankCandidates } from './domain.js';

export function validateLocation(actual,region) {
  if(actual.store!==region.name) throw new Error(`Selected store mismatch: expected ${region.name}, got ${actual.store??'unknown'}`);
  if(actual.zip!==region.zip) throw new Error(`Shipping ZIP mismatch: expected ${region.zip}, got ${actual.zip??'unknown'}`);
}

export function pageCoverage(page) {
  return {complete:page.noResults===true||(page.cards.length>0&&page.cards.every(c=>c.current>0&&(!c.hasOptions||c.minimum>0))),priced:page.pricedCards,total:page.cards.length};
}

export function mergePageSnapshots(previous,next) {
  const collected=new Map();
  for(const card of [...(previous?.cards??[]),...next.cards]) {
    const key=card.productId??card.url??card.name;
    const old=collected.get(key)??{};
    const fields=Object.fromEntries(Object.entries(card).filter(([,value])=>value!==null&&value!==undefined&&value!==''));
    collected.set(key,{...old,...fields,hasOptions:old.hasOptions||card.hasOptions});
  }
  const cards=[...collected.values()];
  return {...next,cards,pricedCards:cards.filter(c=>c.current!==null).length};
}

export function verifyNextUrl(url,query) {
  try {
    const u=new URL(url);
    return u.origin==='https://www.bestbuy.com'&&u.pathname==='/site/searchpage.jsp'&&u.searchParams.get('st')===query&&[...u.searchParams.keys()].every(k=>['st','cp','id'].includes(k));
  }catch{return false;}
}

export function confirmPageChange(previous,next,expected) {
  if(next.page!==expected)throw new Error(`Expected page ${expected}, got page ${next.page}`);
  const signature=p=>[...new Set(p.cards.map(c=>c.productId))].sort().join('|');
  if(previous&&signature(previous)===signature(next)&&!next.noResults)throw new Error('Page products are unchanged after pagination');
}

export function matchingOpenBoxLinks(candidate,offers) {
  const found=new Map();
  for(const offer of offers) {
    const match=offer.path?.match(/^\/product\/[^/]+\/([^/]+)\/sku\/(\d+)\/openbox\/?$/);
    if(!match||match[1]!==candidate.productKey)continue;
    const u=new URL(offer.path,'https://www.bestbuy.com');
    if(['fair','good','excellent'].includes(offer.condition))u.searchParams.set('condition',offer.condition);
    found.set(u.href,{url:u.href,sku:match[2]});
  }
  return [...found.values()];
}

export function smokeAcceptance(result,sku) {
  return result.regions.map(region=>({regionId:region.id,
    found:result.candidates.some(c=>c.regionId===region.id),
    verifiedPrice:result.offers.some(o=>o.regionId===region.id&&o.sku===sku&&['verified','price-only'].includes(o.status)),
  }));
}

export function classifyOffer(candidate,offer) {
  const discount=discountPercent(offer.buyNew,offer.price);
  const valid=discount!==null&&offer.seller==='Best Buy'&&!!candidate.sku&&candidate.sku===offer.sku&&!!offer.condition;
  return {...offer,discount:valid?discount:null,status:valid?(offer.available?'verified':'price-only'):'unverified',
    reason:valid?null:'Buy New, selected price, seller, condition, or matching SKU could not be verified'};
}

export function offerReady(offer,elapsedMs,stableMs) {
  if(!offer.sku||!offer.store||!(offer.price>0)||!(offer.buyNew>0)||!offer.condition||offer.seller!=='Best Buy'||!offer.fulfillment)return false;
  if(/\bPickup\s+Location\b/i.test(offer.fulfillment))return false;
  if(offer.available)return true;
  // The fulfillment service can replace an initial Unavailable state after loading.
  return elapsedMs>=8000&&stableMs>=2000;
}

export async function setRegion(chrome,region,timeout=30000) {
  await chrome.wait(()=>chrome.evaluate(()=>location.origin==='https://www.bestbuy.com'&&document.readyState==='complete'),timeout,'Best Buy session');
  await chrome.evaluate(applyRegionPreferences,region);
}

export async function setShippingZip(chrome,zip,timeout=30000) {
  await chrome.wait(async()=>{const p=await chrome.evaluate(extractPage);return p.zip===zip;},timeout,'shipping ZIP update');
}

async function readSearchPage(chrome,region,options) {
  const timeout=options.pageTimeoutMs;
  await chrome.wait(async()=>{const p=await chrome.evaluate(extractPage);return p.store&&(p.cards.length||p.noResults);},timeout,'search cards');
  await setShippingZip(chrome,region.zip,timeout);
  // Scroll all viewport slices. Product prices hydrate when cards enter the viewport.
  const started=Date.now();
  let page;
  let index=0;
  while(Date.now()-started<timeout) {
    await chrome.evaluate(index=>{const cards=document.querySelectorAll('.product-list-item[data-product-id]');cards[index%Math.max(cards.length,1)]?.scrollIntoView({block:'center'});return true;},index++);
    await new Promise(resolve=>setTimeout(resolve,180));
    page=mergePageSnapshots(page,await chrome.evaluate(extractPage));
    validateLocation(page,region);
    if(pageCoverage(page).complete&&index>=page.cards.length)break;
  }
  if(!page)throw new Error('Search page did not return data');
  return page;
}

export async function verifyCandidate(chrome,candidate,options) {
  await chrome.go(candidate.url);
  await chrome.wait(()=>chrome.evaluate(()=>!!document.querySelector('main')&&/SKU:\s*\d+/.test(document.querySelector('main').innerText)),options.pageTimeoutMs,'product details');
  await chrome.wait(()=>chrome.evaluate(openBuyingOptions),options.pageTimeoutMs,'buying-options control');
  const end=Date.now()+options.pageTimeoutMs;
  let offers;
  while(Date.now()<end) {
    const productPath=new URL(candidate.url).pathname;
    offers=await chrome.evaluate(extractRetailOfferPaths,productPath);
    if(offers.length)break;
    await new Promise(r=>setTimeout(r,350));
  }
  if(!offers?.length)return [{...candidate,status:'unverified',reason:'No open-box product links loaded'}];
  const links=matchingOpenBoxLinks(candidate,offers).slice(0,options.conditionLimit);
  if(!links.length)return [{...candidate,status:'unverified',reason:'No matching product open-box links loaded'}];
  const verified=[];
  for(const {url,sku} of links) {
    try {
      await chrome.go(url);
      const started=Date.now();
      let previous,stableSince=started;
      const detail=await chrome.wait(async()=>{
        const p=await chrome.evaluate(extractOffer);
        const signature=JSON.stringify([p.sku,p.store,p.price,p.buyNew,p.condition,p.fulfillment]);
        if(signature!==previous){previous=signature;stableSince=Date.now();}
        return offerReady(p,Date.now()-started,Date.now()-stableSince)?p:false;
      },options.pageTimeoutMs,'settled open-box availability');
      if(detail.store!==candidate.regionName)throw new Error('Store changed during offer verification');
      verified.push({...candidate,...classifyOffer({...candidate,sku},detail),url});
    }catch(e){verified.push({...candidate,status:'unverified',condition:new URL(url).searchParams.get('condition'),reason:e.message,url});}
  }
  return verified;
}

export async function scan(options) {
  const chrome=options.chrome??new Chrome(options.endpoint);
  chrome.cancelled=options.shouldStop;
  const result={startedAt:new Date().toISOString(),queries:options.queries,regions:options.regions,
    estimate:options.estimate,
    limits:{pages:options.pages,verifyLimit:options.verifyLimit,conditionLimit:options.conditionLimit,minDiscount:options.minDiscount??50},
    coverage:[],candidates:[],offers:[],errors:[],cleanup:{restoredPreferred:false},resourceBlocking:'disabled'};
  const log=options.log??(()=>{});
  const checkpoint=async()=>options.save?.(result);
  try {
    await chrome.connect();
    chrome.tabId=await chrome.createTab('about:blank');
    if(options.extensionId) {
      try {await chrome.prepareSession(options.extensionId,options.blockResources!==false);result.resourceBlocking=options.blockResources===false?'disabled; background session enabled':'images, fonts, and media blocked in scan tab; background session enabled';}
      catch(e){result.resourceBlocking=`unavailable: ${e.message}`;}
    }
    for(const region of options.regions) {
      if(options.shouldStop?.()){result.errors.push('Search interrupted before all regions completed');break;}
      log(`Region: ${region.name} (${region.zip})`);
      try {
        await setRegion(chrome,region,options.pageTimeoutMs);
        const regionCandidates=[];
        for(const query of options.queries) {
          if(options.shouldStop?.())break;
          let previousPage;
          for(let pageNo=1;pageNo<=options.pages;pageNo++) {
            log(`Search: ${region.name} / ${query} / page ${pageNo}`);
            try {
              await chrome.go(searchUrl(query,pageNo));
              const page=await readSearchPage(chrome,region,options);
              confirmPageChange(previousPage,page,pageNo);
              previousPage=page;
              const coverage=pageCoverage(page);
              result.coverage.push({region:region.name,query,page:pageNo,...coverage});
              const candidates=page.cards.filter(c=>c.hasOptions&&c.url&&(!options.match||c.name.toLowerCase().includes(options.match.toLowerCase()))).map(c=>normalizeObservation(c,region,query));
              regionCandidates.push(...candidates);
              result.candidates=mergeObservations([...result.candidates,...candidates]);
              await checkpoint();
              if(page.noResults)break;
            }catch(e){result.coverage.push({region:region.name,query,page:pageNo,complete:false,reason:e.message});await checkpoint();break;}
          }
        }
        const unique=rankCandidates(mergeObservations(regionCandidates),options.preferences).slice(0,options.verifyLimit);
        for(const candidate of unique) {
          log(`Verify: ${region.name} / ${candidate.name}`);
          try {result.offers.push(...await verifyCandidate(chrome,candidate,options));}
          catch(e){result.offers.push({...candidate,status:'unverified',reason:e.message});}
          await checkpoint();
        }
      }catch(e){result.errors.push(`${region.name}: ${e.message}`);await checkpoint();}
    }
  }catch(e){result.errors.push(e.message);}
  finally {
    chrome.cancelled=()=>false;
    try {
      if(chrome.tabId) {
        const preferred=options.allRegions.find(r=>r.preferred)??options.regions[0];
        log(`Restore preferred store: ${preferred.name}`);
        await setRegion(chrome,preferred,options.pageTimeoutMs);
        await chrome.go(searchUrl('asus laptop'));
        await chrome.wait(async()=>{const p=await chrome.evaluate(extractPage);return p.store&&p.cards.length;},options.pageTimeoutMs,'preferred-store search');
        await setShippingZip(chrome,preferred.zip,options.pageTimeoutMs);
        validateLocation(await chrome.evaluate(extractPage),preferred);
        result.cleanup.restoredPreferred=true;
      }
    }catch(e){result.errors.push(`Restore preferred store: ${e.message}`);}
    result.cleanup.errors=await chrome.close().catch(e=>[e.message]);
    result.errors.push(...result.cleanup.errors);
    result.finishedAt=new Date().toISOString();
    await checkpoint();
  }
  return result;
}
