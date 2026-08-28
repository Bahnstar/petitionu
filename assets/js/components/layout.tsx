import { Header } from "./header"
import { Footer } from "./footer"

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-orange-50">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  )
}
