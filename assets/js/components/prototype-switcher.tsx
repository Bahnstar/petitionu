import React, { useEffect } from "react"
import { useSearchParams } from "react-router-dom"

// Throwaway prototype controls. Require both a development bundle and server opt-in.
export const homePrototypesEnabled =
  process.env.NODE_ENV === "development" &&
  document.getElementById("app")?.dataset.prototypesEnabled === "true"

export const homeVariants = [
  { key: "A", name: "Campaign poster", set: "earlier" },
  { key: "B", name: "Campus board", set: "earlier" },
  { key: "C", name: "Cause explorer", set: "earlier" },
  { key: "D", name: "Open invitation", set: "landing" },
  { key: "E", name: "Campus story", set: "landing" },
  { key: "F", name: "First step", set: "landing" },
  { key: "G", name: "Mint invitation", set: "landing" },
]

export function PrototypeSwitcher({ current, state }: { current: string; state: object }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSet = homeVariants.find((variant) => variant.key === current)?.set ?? "landing"
  const variants = homeVariants.filter((variant) => variant.set === activeSet)
  const index = Math.max(0, variants.findIndex((variant) => variant.key === current))

  function selectVariant(key: string) {
    const params = new URLSearchParams(searchParams)
    params.set("variant", key)
    setSearchParams(params, { replace: true, preventScrollReset: true })
    window.scrollTo(0, 0)
  }

  function cycle(direction: number) {
    const next = variants[(index + direction + variants.length) % variants.length]
    selectVariant(next.key)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || target.closest("input, textarea, select, [role='dialog'], [role='slider'], [role='tablist']")))
      ) return

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        cycle(event.key === "ArrowRight" ? 1 : -1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [index, activeSet, searchParams, setSearchParams])

  if (!homePrototypesEnabled) return null

  return (
    <aside id="prototype-switcher" className="prototype-switcher" aria-label="Design prototype controls">
      <div className="prototype-switcher-top">
        <label className="prototype-set-label" htmlFor="prototype-set">
          <span className="sr-only">Prototype set</span>
          <select id="prototype-set" value={activeSet} onChange={(event) => selectVariant(event.target.value === "landing" ? "D" : "A")}>
            <option value="landing">Landing pages · D–G</option>
            <option value="earlier">Earlier explorations · A–C</option>
          </select>
        </label>
        <span className="prototype-current-name" aria-live="polite">{current} / {variants[index].name}</span>
        <details className="prototype-state">
          <summary>State</summary>
          <pre>{JSON.stringify({ variant: current, ...state }, null, 2)}</pre>
        </details>
      </div>
      <div className="prototype-switcher-options" style={{ "--prototype-variant-count": variants.length } as React.CSSProperties}>
        <button id="prototype-previous" type="button" onClick={() => cycle(-1)} aria-label="Previous design">←</button>
        {variants.map((variant) => (
          <button id={`prototype-select-${variant.key}`} key={variant.key} className="prototype-variant-option" type="button" aria-pressed={current === variant.key} onClick={() => selectVariant(variant.key)}>
            <span>{variant.key}</span><strong>{variant.name}</strong>
          </button>
        ))}
        <button id="prototype-next" type="button" onClick={() => cycle(1)} aria-label="Next design">→</button>
      </div>
    </aside>
  )
}
