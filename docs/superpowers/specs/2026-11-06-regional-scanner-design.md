# Regional Best Buy scanner

## Intent

Run a repeatable deal search when the user asks. Use code for the browser loop and calculations. Use the assistant only to start the run, resolve unexpected UI changes, and review a compact shortlist. Keep the existing Chrome MCP session. Do not export cookies or place orders.

## User requirements

- Search premium laptops and desktops. Use the model families supplied in the conversation as an editable pool of search terms. Include broad brand searches. Do not use website filters.
- Search every selected term in all three store regions, sequentially: Otay Ranch (store 1769, ZIP 91915, preferred), Costa Mesa (store 119, ZIP 92626, Orange County), and Hawthorne (store 104, ZIP 90250, near LAX).
- Verify the website's selected store and shipping ZIP. Record both with each observation. Restore Otay Ranch and 91915 at the end.
- Inspect the search-card minimum offer and verify promising offers on the product page. A search-card comparable value is a discovery hint, never proof of the Buy New price.
- A verified discount uses the exact product's displayed Best Buy Buy New price. Keep the selected condition, actual price, seller, and pickup/shipping text. Never present an advertised minimum as confirmed local inventory.
- At least 50% below Buy New is the primary threshold. Preserve unverified candidates and incomplete scans so missing prices do not become false negative results.
- Deduplicate products across terms, but preserve observations from different regions and conditions. Treat marketplace product IDs as distinct from Best Buy SKUs.
- Save local JSON and a concise Markdown report. Ignore live reports in git. Save no account names, cookies, or authentication data.

## Implementation choices

Node.js 22+ with the official MCP SDK will call the existing local HTTP bridge. The installed bridge was tested at http://127.0.0.1:12306/mcp. Each call specifies a scan tab ID; unrelated tabs remain untouched. Readiness uses bounded polling and viewport scrolling. Page failures create diagnostic records instead of empty success reports. Use the website's Next link for pagination; do not assume an unverified results-per-page parameter works.

The default run rotates a small number of terms from each pool and uses two pages per term, in all three regions. CLI options allow an explicit term, all terms, page limits, and verification limits. Keep requests sequential. Record coverage and any limits in the report. Ignore heuristic price targets from the pasted model list; they were not verified. Hardware preferences guide search terms rather than excluding products.

## Optional performance experiment

The installed Chrome MCP extension has declarativeNetRequest permission. Test whether its own options tab can safely install temporary rules limited to the scan tab. If supported, block images, media, and fonts without changing the installed extension. Remove rules and close owned tabs in cleanup. If unsupported, report that image blocking is unavailable and continue with normal page loading. Do not claim bandwidth savings until measured. Keep CSS, scripts, and price requests enabled.

## Acceptance

Offline tests cover money parsing, exact discount boundaries, missing data, duplicate region observations, no-filter search URLs, location mismatch handling, and report labels. A live G14 test searches `asus laptop` at all three configured locations, records the search-card minimum, and attempts to verify the matching Best Buy product. A known historical example is SKU 6629420, Buy New 2299.99 and Fair 1015.99. Live inventory may change; a changed price or unavailable item is a valid result, never a reason to fabricate the historical match.

## Sources

- [Otay Ranch](https://stores.bestbuy.com/ca/chula-vista/2015-birch-rd-1769.html)
- [Costa Mesa](https://stores.bestbuy.com/ca/costa-mesa/901-s-coast-dr-119.html)
- [Hawthorne](https://stores.bestbuy.com/ca/hawthorne.html)
- [Chrome MCP HTTP interface](https://github.com/hangwin/mcp-chrome/blob/master/docs/mcp-cli-config.md)
- [Chrome request rules](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
