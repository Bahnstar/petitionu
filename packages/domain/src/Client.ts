import { Cause, Context, Effect, Exit, Layer, ManagedRuntime, Schema, SchemaIssue } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { type Rpc, RpcClient, type RpcGroup, RpcSerialization } from "effect/rpc"
import type { RpcClientError } from "effect/rpc/RpcClientError"
import { AppRpcs } from "./Rpcs.ts"

/** One error in a failed result. `type` is `unauthenticated`, `forbidden`, `not_found`, `invalid` or `unknown`. */
export interface RpcErrorEntry {
  readonly type: string
  readonly message: string
  readonly field?: string
}

/** What every client function resolves to; it never rejects. */
export type RpcResult<A> =
  | { readonly success: true; readonly data: A }
  | { readonly success: false; readonly errors: ReadonlyArray<RpcErrorEntry> }

type AppRpc = RpcGroup.Rpcs<typeof AppRpcs>
type PayloadArgs<R> = [Rpc.PayloadConstructor<R>] extends [void]
  ? [payload?: void]
  : [payload: Rpc.PayloadConstructor<R>]

/** Promise functions for every procedure, named as on the server. */
export type ApiClient = {
  readonly [R in AppRpc as R["_tag"]]: (
    ...args: PayloadArgs<R>
  ) => Promise<RpcResult<Rpc.Success<R>>>
}

export interface ApiClientOptions {
  /** Where the RPC endpoint lives. Defaults to `/rpc` on the current origin. */
  readonly url?: string
  /** Replaces `fetch`, e.g. to send requests to an in-process server in tests. */
  readonly fetch?: typeof globalThis.fetch
  /** HTTP headers added to every request, read per request. Defaults to `buildCSRFHeaders()`. */
  readonly headers?: () => Record<string, string>
}

interface MetaElement {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
}

/** The bits of `document` the client uses; typed here so the package also builds without DOM. */
interface PageDocument {
  querySelector(selector: string): MetaElement | null
  createElement(tag: "meta"): MetaElement
  readonly head: { append(element: MetaElement): void }
}

const page = () => (globalThis as unknown as { document?: PageDocument }).document

const metaSelector = 'meta[name="csrf-token"]'

/** The CSRF token the server rendered into the page, if any. */
const readMetaToken = (): string | undefined =>
  page()?.querySelector(metaSelector)?.getAttribute("content") ?? undefined

/** The header that proves a request comes from this page. Send it with every RPC call. */
export const buildCSRFHeaders = (): Record<string, string> => {
  const token = readMetaToken()
  return token ? { "X-CSRF-Token": token } : {}
}

/**
 * Fetches a fresh CSRF token and stores it in the page's meta tag. Call it after any sign-in or
 * sign-out, because the token is bound to the session.
 */
export const reloadCSRFToken = async (
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> => {
  const response = await fetchFn("/rpc/csrf-token", { credentials: "same-origin" })
  const { token } = (await response.json()) as { token: string }
  const document = page()
  if (document) {
    let meta = document.querySelector(metaSelector)
    if (!meta) {
      meta = document.createElement("meta")
      meta.setAttribute("name", "csrf-token")
      document.head.append(meta)
    }
    meta.setAttribute("content", token)
  }
  return token
}

const errorTypes: Record<string, string> = {
  Unauthenticated: "unauthenticated",
  Forbidden: "forbidden",
  NotFound: "not_found",
  Invalid: "invalid",
}

interface TaggedFailure {
  readonly _tag: string
  readonly message: string
  readonly fields?: ReadonlyArray<{ readonly field: string; readonly message: string }>
}

const isTaggedFailure = (error: unknown): error is TaggedFailure =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof error._tag === "string" &&
  error._tag in errorTypes

const issueEntries = SchemaIssue.makeFormatterStandardSchemaV1()

/**
 * Checks a payload against its procedure's schema, as the server will, reporting every field it
 * rejects like the server's `Invalid`. Runs before the call, so only payload failures are
 * reported this way; a response the client can't read stays `unknown`.
 */
const payloadErrors = (
  schema: Schema.Top,
  payload: unknown,
): ReadonlyArray<RpcErrorEntry> | undefined => {
  const checked = Schema.encodeUnknownExit(schema as Schema.Codec<unknown>, { errors: "all" })(
    payload,
  )
  if (Exit.isSuccess(checked)) return undefined
  const error = Cause.squash(checked.cause)
  if (!Schema.isSchemaError(error)) return undefined
  return issueEntries(error.issue).issues.map(({ path, message }) => ({
    type: "invalid",
    message,
    ...(path && path.length > 0 ? { field: path.map(String).join(".") } : {}),
  }))
}

const toErrors = (cause: Cause.Cause<unknown>): ReadonlyArray<RpcErrorEntry> => {
  const error = Cause.squash(cause)
  if (!isTaggedFailure(error)) {
    return [{ type: "unknown", message: error instanceof Error ? error.message : String(error) }]
  }
  const type = errorTypes[error._tag]!
  if (error.fields && error.fields.length > 0) {
    return error.fields.map(({ field, message }) => ({ type, message, field }))
  }
  return [{ type, message: error.message }]
}

class Api extends Context.Service<Api, RpcClient.RpcClient<AppRpc, RpcClientError>>()(
  "petitionu/Api",
) {}

/** Wraps the RPC client in promise functions that return `RpcResult`s. */
export const makeApiClient = (options: ApiClientOptions = {}): ApiClient => {
  const headers = options.headers ?? buildCSRFHeaders
  const transport = Layer.mergeAll(
    FetchHttpClient.layer,
    Layer.succeed(FetchHttpClient.RequestInit)({ credentials: "same-origin" }),
  ).pipe(
    Layer.provide(
      options.fetch ? Layer.succeed(FetchHttpClient.Fetch)(options.fetch) : Layer.empty,
    ),
  )
  const layer = Layer.effect(Api)(RpcClient.make(AppRpcs)).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: options.url ?? "/rpc",
        transformClient: HttpClient.mapRequest((request) =>
          HttpClientRequest.setHeaders(request, headers()),
        ),
      }),
    ),
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(transport),
  )
  const runtime = ManagedRuntime.make(layer)
  const client: Record<string, (payload?: unknown) => Promise<RpcResult<unknown>>> = {}
  for (const [tag, rpc] of AppRpcs.requests) {
    client[tag] = (payload) => {
      const invalid = payloadErrors(rpc.payloadSchema, payload)
      if (invalid) return Promise.resolve({ success: false, errors: invalid })
      return runtime.runPromise(
        Api.use((api) =>
          (api as unknown as Record<string, (p: unknown) => Effect.Effect<unknown, unknown>>)[tag]!(
            payload,
          ),
        ).pipe(
          Effect.map((data): RpcResult<unknown> => ({ success: true, data })),
          Effect.catchCause((cause) =>
            Effect.succeed<RpcResult<unknown>>({ success: false, errors: toErrors(cause) }),
          ),
        ),
      )
    }
  }
  return client as unknown as ApiClient
}
