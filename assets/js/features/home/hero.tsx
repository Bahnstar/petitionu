// import { Button } from '@/components/ui/button'
import { Search, Sparkles } from "lucide-react"

export function Hero() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-32">
      <div className="absolute inset-0 -z-10 opacity-[0.03]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fillRule='evenodd'%3E%3Cg fill='%23000000' fillOpacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex animate-in items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary duration-700 fade-in slide-in-from-bottom-3">
            <Sparkles className="h-4 w-4" />
            Join 8,492 students creating change
          </div>

          <h1 className="mb-6 animate-in text-4xl leading-[1.1] font-bold text-balance text-foreground delay-100 duration-700 fade-in slide-in-from-bottom-4 sm:text-5xl lg:text-7xl">
            Transform campus life through{" "}
            <span className="animate-gradient bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_auto] bg-clip-text text-transparent">
              collective action
            </span>
          </h1>

          <p className="mx-auto mb-8 max-w-2xl animate-in text-lg leading-relaxed text-pretty text-muted-foreground delay-200 duration-700 slide-in-from-bottom-5 fade-in sm:text-xl lg:mb-12">
            Join thousands of students making meaningful change. Create petitions, gather support,
            and drive real improvements to your university experience.
          </p>

          <div className="mb-12 flex animate-in flex-col items-center justify-center gap-4 delay-300 duration-700 fade-in slide-in-from-bottom-6 sm:flex-row">
            <button className="w-full rounded-md bg-primary p-2 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:bg-primary/90 sm:w-auto">
              Start a Petition
            </button>
            <button className="w-full rounded-md p-2 transition-all hover:scale-105 sm:w-auto">
              View All Petitions
            </button>
          </div>

          <div className="mx-auto max-w-2xl animate-in delay-500 duration-700 fade-in slide-in-from-bottom-7">
            <div className="group relative">
              <Search className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <input
                type="text"
                placeholder="Search for petitions..."
                className="w-full rounded-lg border border-input bg-card py-4 pr-4 pl-12 text-foreground shadow-sm transition-all placeholder:text-muted-foreground hover:shadow-md focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
