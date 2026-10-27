import React, { Component, ErrorInfo, ReactNode } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error Boundary caught an error:", error, errorInfo)
    this.setState({ error, errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div
          id="application-error"
          role="alert"
          className="flex min-h-[70vh] items-center justify-center bg-background px-5 py-12"
        >
          <div className="app-panel w-full max-w-lg text-center">
            <h1 className="mb-3 font-display text-4xl leading-tight tracking-tight text-foreground">
              Let’s try that again.
            </h1>

            <p className="mb-6 text-muted-foreground">
              This page couldn’t load. Try again, or refresh the page to get a fresh start.
            </p>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="mb-2 cursor-pointer text-sm text-muted-foreground">
                  Error details (development only)
                </summary>
                <div className="mt-2 max-h-32 overflow-auto rounded bg-muted p-3 font-mono text-xs">
                  <div className="mb-2 font-semibold text-red-600">
                    {this.state.error.name}: {this.state.error.message}
                  </div>
                  <div className="whitespace-pre-wrap text-red-500">{this.state.error.stack}</div>
                  {this.state.errorInfo && (
                    <div className="mt-2 text-red-500">
                      <div className="font-semibold">Component Stack:</div>
                      <pre className="whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-wrap justify-center gap-3">
              <Button
                id="application-error-retry"
                onClick={this.handleReset}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Try again
              </Button>

              <Button
                id="application-error-refresh"
                onClick={() => window.location.reload()}
                className="flex items-center gap-2"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Refresh page
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
