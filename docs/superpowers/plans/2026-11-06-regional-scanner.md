# Regional scanner implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. The user has approved the workflow in chat. Implement in this session and create a reviewable PR.

**Goal:** Search all three regions in the existing browser session and report verified laptop and desktop discounts.

**Architecture:** A Node CLI calls Chrome MCP through its local HTTP interface. Browser helpers return only product and location data. Pure functions calculate discounts and produce a report with explicit coverage and verification status.

**Tech Stack:** Node.js 22+, MCP SDK, node:test, linkedom for offline DOM fixtures.

**Spec:** ../specs/2026-11-06-regional-scanner-design.md

## Global constraints

- No website filters. No cookie exports. No orders. Use only owned scan tabs.
- Default stores: Otay Ranch 1769/91915, Costa Mesa 119/92626, Hawthorne 104/90250.
- Use verified Buy New price for final discounts; separate advertised minima from available offers.
- Save live data only in ignored results/. Keep account data out of logs.
- Commit and push each completed unit. Create a PR. Do not merge.

## Review focus

- Missing prices or failed location changes must never produce a complete empty report.
- An advertised minimum is not a verified offer or proof of local pickup.
- Marketplace IDs must never be substituted for the Best Buy SKU.
- A bounded scan must report page, term, region, and verification limits.
- Cleanup must remove temporary rules and return the preferred store without closing user tabs.

### Task 1: Domain data and browser extraction

**Files:** config/search.json, src/domain.js, src/browser.js, test/domain.test.js, test/browser.test.js.

**Interfaces:** normalizeObservation(card, region, query) returns a candidate; discountPercent(newPrice, offerPrice) returns a number or null; extractPage() returns location, cards, and pagination; extractOffer() returns product SKU, Buy New price, selected price, condition, seller, and fulfillment text.

- [ ] Write failing behavior tests with the hand-checked 2299.99/1015.99 example, missing prices, per-region deduplication, safe search URLs, and actual DOM fixtures.
- [ ] Run npm test and confirm the expected missing exports fail.
- [ ] Implement pure functions and DOM extraction. Configure the supplied laptop and desktop search families and three stores.
- [ ] Run npm run check. Commit and push the completed unit.

### Task 2: Browser runner and reports

**Files:** src/chrome.js, src/scanner.js, src/cli.js, src/report.js, test/scanner.test.js, test/report.test.js.

**Interfaces:** Chrome.call(name, args), Chrome.evaluate(fn, argument), scan(options) returns a coverage-aware result; renderReport(result) returns Markdown. CLI exposes scan, inspect, and smoke commands.

- [ ] Write failing tests for fail-closed location checks, incomplete page coverage, advertised/verified separation, and HTML-safe Markdown output.
- [ ] Run npm test and confirm the intended failures.
- [ ] Implement sequential MCP calls, store/ZIP UI changes, bounded scrolling, pagination, candidate verification, checkpoint reports, and cleanup. Test optional image blocking through the installed extension's own options tab.
- [ ] Run npm run check. Commit and push the completed unit.

### Task 3: Live acceptance and handoff

**Files:** README.md, AGENTS.md, docs/live-test.md, CLI refinements if the live page requires them.

- [ ] Run the live G14 smoke test for all three stores and record exact outcomes. If a failure exposes a logic bug, add a regression test before the repair.
- [ ] Document commands, incomplete data, image-blocking results, and store restoration.
- [ ] Run npm run check and command help. Request a fresh whole-branch review and address material findings with regression tests.
- [ ] Commit, push, and create a PR. Report the repo, PR, and live test limits.
