export function money(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const match=String(value ?? '').match(/\$([\d,]+\.\d{2})/);
  return match ? money(Number(match[1].replaceAll(',',''))) : null;
}

export function discountPercent(buyNew, offer) {
  if (!money(buyNew) || !money(offer)) return null;
  return Math.round((1-offer/buyNew)*100*1e6)/1e6;
}

export function searchUrl(query, page=1) {
  if (!query?.trim() || !Number.isInteger(page) || page < 1) throw new Error('Invalid query or page');
  const url=new URL('https://www.bestbuy.com/site/searchpage.jsp');
  url.searchParams.set('st',query.trim());
  if (page>1) url.searchParams.set('cp',String(page));
  return url.href;
}

export function normalizeObservation(card, region, query) {
  let productKey=card.sku || card.productId;
  try {productKey=new URL(card.url).pathname.match(/\/product\/[^/]+\/([^/]+)/)?.[1] || productKey;} catch { /* no link yet */ }
  return {
    ...card, sku:card.sku ?? null, productKey, regionId:region.id, regionName:region.name,
    zip:region.zip, queries:[query], status:'advertised', buyNew:null,
    hintDiscount:discountPercent(card.comparable ?? card.current,card.minimum),
    observedAt:new Date().toISOString(),
  };
}

export function mergeObservations(items) {
  const byKey=new Map();
  for (const item of items) {
    const key=[item.productKey,item.regionId,item.condition??'advertised',item.pickupStore??''].join('|');
    if (!byKey.has(key)) byKey.set(key,{...item,queries:[...(item.queries??[])]});
    else {
      const old=byKey.get(key);
      old.queries=[...new Set([...old.queries,...(item.queries??[])])];
      if ((item.minimum??Infinity)<(old.minimum??Infinity)) old.minimum=item.minimum;
    }
  }
  return [...byKey.values()];
}

export function selectQueries(pool, cursor=0, perType=2) {
  return [...new Set(Object.values(pool).flatMap(terms=>Array.from({length:Math.min(perType,terms.length)},(_,i)=>terms[(cursor*perType+i)%terms.length])))];
}

export function rankCandidates(items,preferences={}) {
  const dense=value=>String(value??'').toLowerCase().replace(/\b(laptop|desktop|gaming)\b/g,'').replace(/[^a-z0-9]/g,'');
  const premium=(preferences.premiumTerms??[]).map(dense).filter(Boolean);
  const gpuTargets=(preferences.gpuTargets??[]).map(dense);
  const score=item=>{
    const name=dense(item.name);
    const ram=Number(item.name?.match(/(\d+)\s*GB\s*(?:DDR\d\s*)?(?:RAM|Memory)/i)?.[1]??0);
    return (item.hintDiscount??0)+(premium.some(term=>name.includes(term))?40:0)+
      (gpuTargets.some(gpu=>name.includes(gpu))?100:0)+(ram>=(preferences.desktopRamGB??preferences.laptopRamGB??32)?10:0);
  };
  // Title specifications are queue hints. The product page still needs verification.
  return [...items].sort((a,b)=>score(b)-score(a));
}
