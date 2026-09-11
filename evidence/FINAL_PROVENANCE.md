# Screenshot provenance — 11 September 2026

- `portfolio-1440.png` and `account-1440.png`: 1440×900 PNG, deployed Cloudflare frontend with the explicit fixed synthetic review dataset. `account-1280.png`: 1280×800 PNG. These are visual evidence, not real account balances.
- Other updated PNGs come from the committed Playwright suites in `tests/browser/`. Provider/API data are mocked explicitly and unexpected requests are rejected where the fixture requires it. Mobile screenshots may use full-page height while the tested viewport is390×844.
- `acceptance-portfolio-1440.jpg`: actual Cloudflare/Worker/Supabase isolated scenario,1440×900 JPEG returned by the browser tool. `acceptance-account-selection.jpg`: selected A/C ledger and side panel during that scenario,1433×896 JPEG. Extensions match the actual returned encoding; neither image was redrawn or edited.
- All scenario names/guests/amounts in these screenshots are fictional. No actual Statement preview or Gmail recipient screenshot from the provider scenario was committed. Those were inspected privately.
- All seven original PNG references in `references/design/` remain unchanged. These output captures are not replacement baselines and were not used to weaken behavioral assertions.
