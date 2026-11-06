const escape=value=>String(value??'—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('|','&#124;').replaceAll('\n',' ');
const dollars=value=>typeof value==='number'?`$${value.toFixed(2)}`:'—';
const link=item=>{try {const u=new URL(item.url);return u.origin==='https://www.bestbuy.com'?`[${escape(item.name)}](${u.href.replaceAll('(','%28').replaceAll(')','%29')})`:escape(item.name);}catch{return escape(item.name);}};

export function isIncomplete(run) {
  return run.coverage.some(c=>!c.complete)||run.errors.length>0||run.offers.some(o=>o.status==='unverified');
}

export function renderReport(run) {
  const incomplete=isIncomplete(run);
  const lines=[`# Best Buy deal search`, '', `Started: ${escape(run.startedAt)}`, '',
    `${incomplete?'Incomplete':'Completed within stated limits'}. All prices are before tax.`, '',
    `Queries: ${(run.queries??[]).map(escape).join(', ')}`, '',
    `Locations: ${(run.regions??[]).map(r=>`${escape(r.name)} (${escape(r.zip)})`).join(', ')}`, '',
    `Limits: ${run.limits?.pages??'—'} pages per query and region; ${run.limits?.verifyLimit??'—'} product verifications per region.`, '',
    '## Verified available offers', '',
    'The selected open-box price, Buy New price, and fulfillment text were read from the same product page. Pickup can be at a nearby store.', '',
    '| Product | Search region | Buy New | Open box | Discount | Condition | Pickup store |',
    '| --- | --- | ---: | ---: | ---: | --- | --- |'];
  const threshold=run.limits?.minDiscount??50;
  const verified=run.offers.filter(o=>o.status==='verified'&&o.discount>=threshold).sort((a,b)=>(b.discount??0)-(a.discount??0));
  for(const o of verified) lines.push(`| ${link(o)} | ${escape(o.regionName)} | ${dollars(o.buyNew)} | ${dollars(o.price)} | ${o.discount?.toFixed(2)??'—'}% | ${escape(o.condition)} | ${escape(o.pickupStore)} |`);
  if(!verified.length) lines.push('| No verified available offers | | | | | | |');
  lines.push('', '## Near misses', '', `Verified available offers below the ${threshold}% target.`, '');
  for(const o of run.offers.filter(o=>o.status==='verified'&&o.discount<threshold)) lines.push(`- ${link(o)} — ${escape(o.regionName)}; ${dollars(o.price)} versus Buy New ${dollars(o.buyNew)} (${o.discount.toFixed(2)}%); ${escape(o.condition)}; pickup ${escape(o.pickupStore)}.`);
  lines.push('', '## Prices without confirmed fulfillment', '');
  for(const o of run.offers.filter(o=>o.status!=='verified')) lines.push(`- ${link(o)} — ${escape(o.regionName)}; ${dollars(o.price)}; ${escape(o.status)}. ${escape(o.fulfillment??o.reason)}`);
  lines.push('', '## Advertised minima — unverified', '', 'These are search-card hints. They do not prove the Buy New price or local availability.', '');
  for(const c of run.candidates) lines.push(`- ${link(c)} — ${escape(c.regionName)}: from ${dollars(c.minimum)}.`);
  lines.push('', '## Coverage', '', '| Region | Query | Page | Priced cards | Status |', '| --- | --- | ---: | ---: | --- |');
  for(const c of run.coverage) lines.push(`| ${escape(c.region)} | ${escape(c.query)} | ${c.page??'—'} | ${c.priced??0}/${c.total??0} | ${c.complete?'Complete':'Incomplete'}${c.reason?`: ${escape(c.reason)}`:''} |`);
  if(run.errors.length) lines.push('', '## Errors', '', ...run.errors.map(e=>`- ${escape(e)}`));
  lines.push('', `Preferred store restored: ${run.cleanup?.restoredPreferred?'yes':'not confirmed'}.`, `Resource blocking: ${escape(run.resourceBlocking??'not tested')}.`, '');
  return lines.join('\n');
}
