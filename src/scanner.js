import { Chrome } from './chrome.js';
import { extractPage, extractOffer } from './browser.js';
import { discountPercent, normalizeObservation, mergeObservations, searchUrl } from './domain.js';

export function validateLocation(actual,region) {
  if(actual.store!==region.name) throw new Error(`Selected store mismatch: expected ${region.name}, got ${actual.store??'unknown'}`);
  if(actual.zip!==region.zip) throw new Error(`Shipping ZIP mismatch: expected ${region.zip}, got ${actual.zip??'unknown'}`);
}

export function pageCoverage(page) {
  return {complete:page.noResults===true||(page.cards.length>0&&page.pricedCards===page.cards.length),priced:page.pricedCards,total:page.cards.length};
}

export function verifyNextUrl(url,query) {
  try {
    const u=new URL(url);
    return u.origin==='https://www.bestbuy.com'&&u.pathname==='/site/searchpage.jsp'&&u.searchParams.get('st')===query&&[...u.searchParams.keys()].every(k=>['st','cp','id'].includes(k));
  }catch{return false;}
}

export function classifyOffer(candidate,offer) {
  const discount=discountPercent(offer.buyNew,offer.price);
  const valid=discount!==null&&offer.seller==='Best Buy'&&!!offer.sku&&!!offer.condition&&(!candidate.sku||candidate.sku===offer.sku);
  return {...offer,discount:valid?discount:null,status:valid?(offer.available?'verified':'price-only'):'unverified',
    reason:valid?null:'Buy New, selected price, seller, condition, or matching SKU could not be verified'};
}

export async function setRegion(chrome,region,timeout=30000) {
  await chrome.go('https://www.bestbuy.com/site/store-locator');
  await chrome.wait(()=>chrome.evaluate(()=>!!document.querySelector('input[placeholder="Search by ZIP, City or State"]')),timeout,'store locator');
  await chrome.fill('input[placeholder="Search by ZIP, City or State"]',region.zip);
  await chrome.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Update');if(!b)throw new Error('Store locator Update button missing');b.click();return true;});
  await chrome.wait(()=>chrome.evaluate(({storeId})=>[...document.querySelectorAll('.shop-location-card')].some(c=>[...c.querySelectorAll('a')].some(a=>a.getAttribute('href')?.match(/\/(\d+)$/)?.[1]===storeId)),region),timeout,'regional store results');
  await chrome.evaluate(({storeId})=>{
    const c=[...document.querySelectorAll('.shop-location-card')].find(c=>[...c.querySelectorAll('a')].some(a=>a.getAttribute('href')?.match(/\/(\d+)$/)?.[1]===storeId));
    const b=[...c.querySelectorAll('button')].find(b=>/Make This Your Store/i.test(b.innerText));
    if(b)b.click();return true;
  },region);
  await chrome.wait(()=>chrome.evaluate(name=>document.querySelector('button[aria-label^="Your Store:"]')?.getAttribute('aria-label')===`Your Store: ${name}`,region.name),timeout,'selected store');
}

export async function setShippingZip(chrome,zip,timeout=30000) {
  const initial=await chrome.evaluate(extractPage);
  if(initial.zip===zip)return;
  await chrome.evaluate(()=>{const link=[...document.querySelectorAll('a')].find(a=>/^\d{5}$/.test(a.innerText.trim()));if(!link)throw new Error('Shipping ZIP control missing');link.click();return true;});
  await chrome.wait(()=>chrome.evaluate(()=>!![...document.querySelectorAll('input')].find(e=>e.getBoundingClientRect().width&&/zip|postal/i.test(e.placeholder+' '+e.getAttribute('aria-label')+' '+e.id))),timeout,'shipping ZIP input');
  const selector=await chrome.evaluate(()=>{const e=[...document.querySelectorAll('input')].find(e=>e.getBoundingClientRect().width&&/zip|postal/i.test(e.placeholder+' '+e.getAttribute('aria-label')+' '+e.id));if(e.id)return `[id=${JSON.stringify(e.id)}]`;e.setAttribute('data-deal-hunter-zip','true');return '[data-deal-hunter-zip="true"]';});
  await chrome.fill(selector,zip);
  await chrome.evaluate(()=>{const input=document.querySelector('[data-deal-hunter-zip="true"]')??[...document.querySelectorAll('input')].find(e=>e.getBoundingClientRect().width&&/zip|postal/i.test(e.placeholder+' '+e.getAttribute('aria-label')+' '+e.id));const scope=input.closest('form')??input.parentElement.parentElement;const b=[...scope.querySelectorAll('button')].find(b=>/^(Update|Apply|Save|Submit)$/i.test(b.innerText.trim()))??scope.querySelector('button[type="submit"]');if(!b)throw new Error('Shipping ZIP submit button missing');b.click();return true;});
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
    page=await chrome.evaluate(extractPage);
    validateLocation(page,region);
    if(pageCoverage(page).complete)break;
  }
  if(!page)throw new Error('Search page did not return data');
  return page;
}

async function nextSearchPage(chrome,query) {
  return chrome.evaluate(query=>{
    const a=[...document.querySelectorAll('a')].find(a=>/^(Next|Next Page|Go to next page)$/i.test((a.getAttribute('aria-label')||a.innerText).trim()));
    if(!a||a.getAttribute('aria-disabled')==='true')return false;
    const u=new URL(a.href,location.href);
    if(u.origin!=='https://www.bestbuy.com'||u.pathname!=='/site/searchpage.jsp'||u.searchParams.get('st')!==query||[...u.searchParams.keys()].some(k=>!['id','st','cp'].includes(k)))throw new Error('Next page contains unexpected filters or URL');
    a.click();return true;
  },query);
}

async function verifyCandidate(chrome,candidate,options) {
  await chrome.go(candidate.url);
  await chrome.wait(()=>chrome.evaluate(()=>!!document.querySelector('main')&&/SKU:\s*\d+/.test(document.querySelector('main').innerText)),options.pageTimeoutMs,'product details');
  const opened=await chrome.evaluate(()=>{
    const main=document.querySelector('main')??document.body;
    const link=[...main.querySelectorAll('a,button')].find(e=>/^More options from/i.test(e.innerText.trim())||/New and Open-Box/i.test(e.innerText));
    if(link){link.scrollIntoView({block:'center'});link.click();return true;}return false;
  });
  if(!opened)return [{...candidate,status:'unverified',reason:'Product offer selector was not found'}];
  const end=Date.now()+options.pageTimeoutMs;
  let offers;
  while(Date.now()<end) {
    offers=await chrome.evaluate(()=>[...document.querySelectorAll('a')].map(a=>({text:a.innerText,href:a.getAttribute('href')})).filter(a=>a.href?.includes('/openbox')));
    if(offers.length)break;
    await new Promise(r=>setTimeout(r,350));
  }
  if(!offers?.length)return [{...candidate,status:'unverified',reason:'No open-box product links loaded'}];
  const links=[...new Set(offers.map(o=>new URL(o.href,'https://www.bestbuy.com').href))].slice(0,options.conditionLimit);
  const verified=[];
  for(const url of links) {
    await chrome.go(url);
    const detail=await chrome.wait(async()=>{const p=await chrome.evaluate(extractOffer);return p.price!==null&&p.buyNew!==null?p:false;},options.pageTimeoutMs,'open-box purchase panel');
    if(detail.store!==candidate.regionName)throw new Error('Store changed during offer verification');
    verified.push({...candidate,...classifyOffer(candidate,detail),url});
  }
  return verified;
}

export async function scan(options) {
  const chrome=options.chrome??new Chrome(options.endpoint);
  chrome.cancelled=options.shouldStop;
  const result={startedAt:new Date().toISOString(),queries:options.queries,regions:options.regions,
    limits:{pages:options.pages,verifyLimit:options.verifyLimit,conditionLimit:options.conditionLimit,minDiscount:options.minDiscount??50},
    coverage:[],candidates:[],offers:[],errors:[],cleanup:{restoredPreferred:false},resourceBlocking:'disabled'};
  const log=options.log??(()=>{});
  const checkpoint=async()=>options.save?.(result);
  try {
    await chrome.connect();
    chrome.tabId=await chrome.createTab('about:blank');
    if(options.extensionId) {
      try {await chrome.blockResources(options.extensionId);result.resourceBlocking='images, fonts, and media blocked in scan tab';}
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
          let url=searchUrl(query);
          for(let pageNo=1;pageNo<=options.pages;pageNo++) {
            log(`Search: ${region.name} / ${query} / page ${pageNo}`);
            try {
              if(pageNo===1)await chrome.go(url);
              const page=await readSearchPage(chrome,region,options);
              const coverage=pageCoverage(page);
              result.coverage.push({region:region.name,query,page:pageNo,...coverage});
              const candidates=page.cards.filter(c=>c.hasOptions&&c.minimum!==null&&c.url&&(!options.match||c.name.toLowerCase().includes(options.match.toLowerCase()))).map(c=>normalizeObservation(c,region,query));
              regionCandidates.push(...candidates);
              result.candidates=mergeObservations([...result.candidates,...candidates]);
              await checkpoint();
              if(pageNo===options.pages)break;
              if(!await nextSearchPage(chrome,query))break;
              await new Promise(r=>setTimeout(r,600));
            }catch(e){result.coverage.push({region:region.name,query,page:pageNo,complete:false,reason:e.message});await checkpoint();break;}
          }
        }
        const unique=mergeObservations(regionCandidates).sort((a,b)=>(b.hintDiscount??-Infinity)-(a.hintDiscount??-Infinity)).slice(0,options.verifyLimit);
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
