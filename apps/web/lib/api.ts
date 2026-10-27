import { makeApiClient } from "@petitionu/domain"

/** The app's RPC procedures; every call sends the page's CSRF token. */
export const api = makeApiClient()
