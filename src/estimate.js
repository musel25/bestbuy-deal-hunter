// Planning ranges informed by the live tests in docs/live-test.md.
// This assumes the full verification cap is used. It is not a deadline.
export function estimateRuntime({queryCount,regionCount,pages,verifyLimit,conditionLimit}) {
  for(const value of [queryCount,regionCount,pages,verifyLimit,conditionLimit]) {
    if(!Number.isInteger(value)||value<1)throw new Error('Runtime estimate requires positive integer counts');
  }
  const searchPages=queryCount*regionCount*pages;
  const productsToVerify=regionCount*verifyLimit;
  const conditionPages=productsToVerify*conditionLimit;
  const minSeconds=10+searchPages*8+productsToVerify*6+conditionPages*5;
  const maxSeconds=25+searchPages*15+productsToVerify*12+conditionPages*10;
  return {searchPages,productsToVerify,conditionPages,minMinutes:Math.ceil(minSeconds/60),maxMinutes:Math.ceil(maxSeconds/60),
    basis:'Planning range from prior live runs, assuming the full verification cap. Fewer candidates can finish sooner. Slow pages or timeouts can take longer.'};
}
