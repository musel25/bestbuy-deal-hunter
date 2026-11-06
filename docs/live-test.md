# Live test record — November 6, 2026

The test used the user's existing Chrome MCP session. No authentication cookies were exported. Test reports remain in ignored results/ files.

Availability correction: the earlier negative observations below could be read before Best Buy finished loading fulfillment. A later fresh Hawthorne Fair page kept its Pickup Location placeholder for about five seconds, then showed one unit at Culver City for $1,015.99, ready in one hour. Treat the earlier Unavailable records as historical, unconfirmed negatives. The verifier now rejects that placeholder and waits for negative states to settle before accepting them.

The corrected verifier was then run with resource blocking enabled for Fair condition in all three regions. Otay Ranch and Costa Mesa resolved to Unavailable. The Hawthorne region resolved to one Fair unit at Culver City, ready in one hour, with shipping unavailable. The price was $1,015.99 versus Buy New $2,299.99 (55.83% less). Cleanup restored Otay Ranch and reported no errors. The report uses the g14-availability prefix in results/. The negative-state timing guard is a practical settling interval, not proof that all future network updates will finish within it.

## Confirmed behavior

- A normal Node.js MCP client can read the existing browser session. An initial extraction from an already loaded page took about 10 ms. This is not a full-search timing.
- Temporary image, font, and media rules work in the scan tab. The helper uses the installed extension's permissions. No installed extension files were changed.
- A persistent debugger connection through that helper keeps the scan tab active for rendering while it stays in the background. Browser reads use the same connection. A full page in each of the three regions took about 36 seconds in the bounded test ending at 21:26:54 UTC.
- The selected store and destination ZIP can be set through the two location preferences and verified in the rendered page. The tested regions were Otay Ranch/91915, Costa Mesa/92626, and Hawthorne/90250.
- The live cp=2 URL returned a different product set. The first page sometimes had no Next link. The scanner now uses explicit page URLs and checks for unchanged products.
- Broad `asus laptop` searches found the reference Ryzen 9 270 G14 on page three. Some later broad or narrow runs placed it differently. Search order and inventory are variable.
- The refreshed canonical product page could show only new offers in its buying sheet. Its retail SKU could still be read there. The direct retail Fair page still displayed 1015.99 and Buy New 2299.99 during the test.
- A direct open-box page can show a price and a standalone Unavailable message. The parser preserves the price and does not claim inventory.
- Completed cleanup attempts restored Otay Ranch and 91915, removed temporary rules, detached the scan debugger, and closed owned scan tabs.

## Limits and failures observed

Initial direct HTTP and separate Playwright-browser probes failed to load Best Buy. The existing Chrome session was therefore used.

Early runs exposed background throttling, virtualized cards, missing first-page pagination controls, div-based buying controls, and the distinction between marketplace product IDs and retail SKUs. These produced explicit incomplete reports. Regression tests cover the resulting logic changes.

One broad run had a local MCP fetch failure while entering the second Hawthorne page. It was recorded as incomplete. An exact numeric SKU query redirected to a product page; the search-page readiness check rejected that redirect. Use model or brand terms for discovery.

The displayed minimum and the existence of a priced open-box route do not establish local availability. Check the selected condition's current pickup/shipping text. No purchase availability is guaranteed by these historical observations.

## Final reference recheck

The final production verifier rechecked the G14 candidate found in the earlier broad ASUS search. It read the retail SKU from the buying sheet and checked Fair condition in all three regions. This was a targeted verification, not a repeat of all discovery pages.

| Region | SKU | Fair price | Buy New | Discount | Fulfillment |
| --- | --- | ---: | ---: | ---: | --- |
| Otay Ranch / 91915 | 6629420 | $1,015.99 | $2,299.99 | 55.83% | Unavailable |
| Costa Mesa / 92626 | 6629420 | $1,015.99 | $2,299.99 | 55.83% | Unavailable |
| Hawthorne / 90250 | 6629420 | $1,015.99 | $2,299.99 | 55.83% | Unavailable |

All three observations were classified as price-only. No available deal was claimed. Cleanup restored Otay Ranch and 91915 and reported no errors. The local JSON and Markdown files use the reference-final prefix in results/.

## Repeat

## Silent-run follow-up

Tab creation and every navigation now request background mode, including helper-unavailable fallback. A live check captured the active tab before setup, after scan-tab creation, after helper setup, after navigation, and after cleanup. The active tab stayed unchanged at every stage. Background rendering emulation still worked and cleanup reported no errors. This check did not start a deal hunt or change the store preferences.

The CLI now supports --estimate without contacting Chrome. Planning ranges count search pages, the per-region verification cap, and all selected open-box conditions. The normal 4-query/3-region/2-page run estimates 12–24 minutes when the full 8-product-per-region verification cap is used. A 1-query/3-region/1-page/1-product-per-region run estimates 2–4 minutes. The full 34-query pool estimates 36–69 minutes. These are planning estimates informed by earlier tests, not measured full-pool run times or upper time limits.

## Repeat commands

```bash
npm run check
npm run smoke -- --pages 5
npm run scan -- --query "asus laptop" --query "legion tower" --pages 2 --verify 2
```

The smoke command reports failure when it cannot find and verify the reference product in each selected region within the stated limits. A live failure can reflect changed ranking, unavailable inventory, missing data, or a broken selector. Read the report before drawing a conclusion.
