import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
  HttpStaticServer,
} from "effect/http"
import { AppConfig } from "./Config.ts"

/** Marker in `apps/web/index.html` that is replaced with per-request head tags. */
const headMarker = "<!-- petitionu:head -->"

/**
 * Hook for tags rendered into the shell's `<head>` on every request. The default adds
 * nothing; the CSRF feature provides one that renders the CSRF meta tag.
 */
export const ShellHead = Context.Reference<
  (request: HttpServerRequest.HttpServerRequest) => Effect.Effect<string>
>("petitionu/ShellHead", { defaultValue: () => () => Effect.succeed("") })

/** The HTML shell served for every SPA route. */
export const ShellRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const config = yield* AppConfig
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const renderHead = yield* ShellHead
    const templatePath = path.join(config.webDistDir, "index.html")
    const template = yield* fs.readFileString(templatePath).pipe(Effect.option)
    if (Option.isNone(template)) {
      yield* Effect.logWarning("Web app is not built; SPA routes will return 503", {
        templatePath,
      })
    }

    const shell = Effect.gen(function* () {
      if (Option.isNone(template)) {
        return HttpServerResponse.text("The web app has not been built.", { status: 503 })
      }
      const request = yield* HttpServerRequest.HttpServerRequest
      const head = yield* renderHead(request)
      return HttpServerResponse.html(template.value.replace(headMarker, head)).pipe(
        HttpServerResponse.setHeader("cache-control", "no-store"),
      )
    })

    // Also matches `/ash-typescript` itself.
    yield* router.add("GET", "/ash-typescript/*", shell)
  }),
)

/**
 * Files from the web build: content-hashed bundles under `/assets` are cached for a year;
 * everything else (favicon, images, robots.txt) is revalidated. `/` redirects to the app.
 */
export const StaticRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const { webDistDir } = yield* AppConfig
    const path = yield* Path.Path
    const publicFiles = HttpRouter.use(
      Effect.fn(function* (router) {
        const files = (yield* HttpStaticServer.make({
          root: webDistDir,
          index: undefined,
          cacheControl: "no-cache",
        })).pipe(Effect.catch(HttpServerRespondable.toResponse))
        // A root wildcard also claims `/`, so the root redirect lives in the same handler.
        const fallback = Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          if (request.url === "/" || request.url.startsWith("/?")) {
            return HttpServerResponse.redirect("/ash-typescript", { status: 302 })
          }
          return yield* files
        })
        yield* router.add("GET", "/*", fallback)
      }),
    )
    return Layer.mergeAll(
      HttpStaticServer.layer({
        root: path.join(webDistDir, "assets"),
        prefix: "/assets",
        index: undefined,
        cacheControl: "public, max-age=31536000, immutable",
      }),
      publicFiles,
    )
  }),
)
