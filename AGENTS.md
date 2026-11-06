# Best Buy search workflow

Use ASD-STE100 Simplified Technical English in user messages. Use short sentences and active voice.

When the user requests a deal search, run this repository's CLI. Do not drive every card through separate assistant browser calls. Read the generated JSON and Markdown files and return a short ranked list.

1. Read config/search.json and README.md.
2. Check that Chrome MCP is connected. Do not export cookies.
3. Run npm run scan -- --estimate with the intended options. Give the user the estimated time range before starting. Then run npm run scan with the same options, without --estimate. If the user names terms, use --query for each term.
4. Search all three regions unless the user explicitly requests a subset: Otay Ranch 91915, Costa Mesa 92626, Hawthorne 90250. Otay Ranch is the preferred store, not the only search region.
5. Apply no website filters. Keep broad brand searches and specific premium laptop and desktop searches in the pool.
6. Read the latest results/*.json and results/*.md. Exit status 2 is incomplete data, not proof that no deals exist.
7. Lead with offers at least 50% below the verified Best Buy Buy New price. Use config/search.json preferences for the final hardware ranking. Favor the requested 32GB configurations and GPU targets after verifying exact specifications. Show the exact model, condition, selected offer price, Buy New price, discount, actual pickup store or shipping availability, and product link. Mark prices and availability as observations at the report time.
8. Keep advertised minima and prices without confirmed fulfillment separate. A search-card comparable value cannot prove the Buy New price. A marketplace product ID cannot prove the Best Buy SKU.
9. Confirm cleanup restored Otay Ranch and removed temporary rules. Report any failure. Do not close user-owned tabs.

The CLI handles rotation, extraction, resource blocking, pagination, deduplication, and local reports. If a live selector breaks, inspect only the affected scan page. Add a regression test before repairing logic. Do not retry indefinitely or claim a successful full scan after a partial run.

Run searches silently. Never activate a scan tab, switch the user's active tab, or focus a browser window. All navigation and tab creation must use background mode. A helper failure does not authorize foreground automation. Preserve the user's active window and tab during setup, scanning, and cleanup. Report incomplete data if background rendering fails.

For repository changes, use a topic branch. Run npm run check. Use Conventional Commits. Push every commit. Create a reviewable PR. Do not merge without authorization.

Never commit live reports, cookies, account data, or browser profiles. Do not buy products or add them to the cart.
