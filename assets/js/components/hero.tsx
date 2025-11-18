// import { Button } from '@/components/ui/button'
import { Search, Sparkles } from "lucide-react"

export function Hero() {
  return (
    <section className="relative py-20 lg:py-32 overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-[0.03]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fillRule='evenodd'%3E%3Cg fill='%23000000' fillOpacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-in fade-in slide-in-from-bottom-3 duration-700">
            <Sparkles className="w-4 h-4" />
            Join 8,492 students creating change
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-foreground mb-6 text-balance leading-[1.1] animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            Transform campus life through{" "}
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
              collective action
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground mb-8 lg:mb-12 text-pretty max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-5 duration-700 delay-200">
            Join thousands of students making meaningful change. Create petitions, gather support,
            and drive real improvements to your university experience.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300">
            <button className="bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all w-full sm:w-auto shadow-lg shadow-primary/20 p-2 rounded-md">
              Start a Petition
            </button>
            <button className="w-full sm:w-auto hover:scale-105 transition-all p-2 rounded-md">
              View All Petitions
            </button>
          </div>

          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-7 duration-700 delay-500">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Search for petitions..."
                className="w-full pl-12 pr-4 py-4 rounded-lg border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm hover:shadow-md"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
