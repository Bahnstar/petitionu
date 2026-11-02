/**
 * Sent by the app's own calls to the endpoints an emailed link's token acts on. A navigation, an
 * image or a plain link can't set a header, and another site's `fetch` with it needs a CORS
 * preflight the server doesn't grant, so requiring it works in every browser.
 */
export const appRequestHeader = "x-petitionu-app"
export const appRequestHeaders = { [appRequestHeader]: "1" }
