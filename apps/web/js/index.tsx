import React from "react"
import { createRoot } from "react-dom/client"
import { buildCSRFHeaders, reloadCSRFToken } from "@petitionu/domain"
import { App } from "./app"

const root = createRoot(document.getElementById("app")!)

// The server renders the CSRF token into the page. Vite's dev server serves the bare
// index.html, so fetch a token before the first RPC call when the page has none.
const csrfReady = buildCSRFHeaders()["X-CSRF-Token"]
  ? Promise.resolve()
  : reloadCSRFToken().then(
      () => undefined,
      () => undefined,
    )

void csrfReady.then(() =>
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  ),
)
