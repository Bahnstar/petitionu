import type { ComponentProps } from "react"
import { useLocation } from "react-router-dom"

export function AuthLink({ page = "/sign-in", ...props }: Omit<ComponentProps<"a">, "href"> & { page?: "/sign-in" | "/register" }) {
  const { pathname, search, hash } = useLocation()
  const params = new URLSearchParams({ return_to: pathname + search + hash })
  return <a {...props} href={`${page}?${params}`} />
}
