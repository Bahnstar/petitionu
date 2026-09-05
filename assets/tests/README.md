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
