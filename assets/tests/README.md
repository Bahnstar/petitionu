# Landing navigation browser regression

Start the Phoenix development server with its assets built. Use a Playwright
installation with its Chromium browser available, then run from the repository
root:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright \
BASE_URL=http://localhost:4000 \
SCREENSHOT_DIR=/tmp/petitionu-browser-tests \
node assets/tests/landing-navigation.mjs
```

`PLAYWRIGHT_MODULE` is optional when `playwright` resolves normally from this
directory. `BASE_URL` defaults to `http://localhost:4000`; omit `SCREENSHOT_DIR`
to skip screenshots. No additional application dependencies are required.

The script checks the root redirect, pending authentication, signed-in and
signed-out account links, header and footer petition browsing, and navigation
destinations at desktop and 320px widths. RPC responses are mocked in the
browser; this does not create accounts or validate server authentication.
Screenshots omit the development toolbar without changing application code.

The master audit regression checks use the same setup:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright \
BASE_URL=http://localhost:4000 \
node assets/tests/master-audit.mjs
```

These checks cover anonymous and expired classroom cards, classroom role gates,
TA membership controls, sign-in destinations, draft persistence and isolation,
forward navigation scroll/focus, and cached counts after creation and signing.
RPC fixtures return only requested fields, so omitted card fields cause failures.
Set `CHECK=draft` (or another substring of a check name) to run a focused subset.
Set `SCREENSHOT_DIR` to capture the student classroom restriction, active TA
controls with an anonymous expired petition, and a restored draft before publishing.
Authentication callbacks and redirect validation are tested separately in ExUnit;
the browser draft test simulates signing in after visiting the real sign-in page.
