# Best Buy Deal Hunter

Search local open-box laptop and desktop offers. Compare each offer with the verified Best Buy **Buy New** price.

A Node.js script calls the existing Chrome MCP connection. The search loop uses no model calls. The assistant can start a run and review its JSON and Markdown reports. Cookies remain in Chrome.

## Default regions

Every default run searches every selected term in all three regions.

| Region | Store | ZIP | Priority |
| --- | --- | --- | --- |
| San Diego | [Otay Ranch, #1769](https://stores.bestbuy.com/ca/chula-vista/2015-birch-rd-1769.html) | 91915 | Preferred |
| Orange County | [Costa Mesa, #119](https://stores.bestbuy.com/ca/costa-mesa/901-s-coast-dr-119.html) | 92626 | Also search |
| Near LAX | [Hawthorne, #104](https://stores.bestbuy.com/ca/hawthorne.html) | 90250 | Also search |

The scanner sets only Best Buy's locStoreId and locDestZip location preferences inside Chrome. It checks the displayed store and ZIP after reloading. It does not read or copy login cookies. Pickup may be at a nearby store. It reports that store separately. It attempts to restore Otay Ranch and 91915 after the run.

## Setup

Use Node.js 22 or later. Open Chrome with [Chrome MCP](https://github.com/hangwin/mcp-chrome) connected. Its default local endpoint is `http://127.0.0.1:12306/mcp`.

```bash
npm ci
npm run check
```

No separate browser, Selenium driver, Best Buy API key, or cookie file is required.

## Search

```bash
# Rotate one term from each pool. Search all three regions.
npm run scan

# Search explicit terms in all three regions.
npm run scan -- --query "asus laptop" --query "legion tower"

# G14 acceptance test: broad ASUS search, then inspect the Ryzen 9 270 model.
npm run smoke -- --pages 1

# Search the complete configured pool. This takes longer.
npm run scan -- --all

# Increase the bounds.
npm run scan -- --pages 3 --verify 12

# Disable the optional resource-blocking optimization.
npm run scan -- --no-block

# Read product data from a known tab. This command does not navigate.
npm run inspect -- --tab 12345

node src/cli.js --help
```

Edit [config/search.json](config/search.json) to change the pool, stores, and limits. The primary laptop pool has the ten requested families. Separate pools hold productivity laptops, broad searches, and desktops. The preferences section records the 32GB RAM and GPU targets. These are guidance for the assistant's final ranking, not claims that every configuration exists. Exact hardware must be checked on the product page.

Website searches apply no category, price, condition, availability, RAM, or GPU filters. They use the search term and normal pagination. The scanner waits for prices and scrolls cards into view. Missing prices produce incomplete coverage, never zero-dollar deals.

## Prices and reports

Reports are written during the run to ignored results/*.json and results/*.md files. The report separates verified available offers, prices without confirmed fulfillment, advertised minima, coverage, and errors.

The discount is `(Buy New - selected open-box price) / Buy New × 100`. A comparable value from a search card only helps order the verification queue. It is not a verified Buy New price. A marketplace product ID is not assumed to be a Best Buy SKU.

The main target is at least 50% below Buy New. Review the configuration, condition, actual pickup store, and final price before purchase.

Exit status 2 means errors or incomplete search pages. Available observations are still saved. The scanner never places orders or adds items to the cart.

## Browser behavior

The scanner creates its own tabs and verifies their ownership. Chrome must remain open. With the installed extension helper, Chrome's debugger keeps the scan tab active for page rendering while it stays in the background. The same helper executes browser reads, so it does not compete with a second debugger connection. If that helper is unavailable, navigation activates the scan tab.

When supported, temporary Chrome request rules block images, fonts, and video in the scan tab. The installed Chrome MCP extension's own options tab controls those rules. Cleanup removes the rules, stops debugger emulation, and closes owned tabs. Extension files and global browser settings are not changed. The Linux native-host manifest can supply the extension ID. On other installations, use CHROME_MCP_EXTENSION_ID or --extension-id.

Use Ctrl+C once to request cleanup. A forced process kill or browser crash can leave a stale results/.scan.lock file. Check that no scanner is running before removing it. Chrome clears session request rules after a browser restart.

Only one scanner should use the Best Buy session at a time. Store selection is shared by Best Buy tabs. The scanner therefore runs regions sequentially.

Optional environment variable: CHROME_MCP_URL selects another local MCP endpoint.

See [the design](docs/superpowers/specs/2026-11-06-regional-scanner-design.md) for scope and acceptance criteria.
