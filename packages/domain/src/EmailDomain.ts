/**
 * School-domain rules for automatic organization membership.
 *
 * Known organizations match their exact email host. New organizations are created only
 * beneath .edu and .ac.uk, with student subdomains grouped under the school.
 */

const personalDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "ymail.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "mail.com",
  "gmx.com",
  "gmx.net",
])

const hostname = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/** The lower-cased host of an email address, or `undefined` for personal or malformed hosts. */
export const fromEmail = (email: string): string | undefined => {
  const parts = email.toLowerCase().split("@")
  if (parts.length !== 2) return undefined
  const [local = "", host = ""] = parts
  if (local === "" || host.length > 253) return undefined
  return hostname.test(host) && !personalDomains.has(host) ? host : undefined
}

/** The school domain a host belongs to (`students.school.edu` → `school.edu`), if supported. */
export const schoolDomain = (host: string): string | undefined => {
  const labels = host.split(".").reverse()
  if (labels[0] === "edu" && labels.length >= 2) return `${labels[1]}.edu`
  if (labels[0] === "uk" && labels[1] === "ac" && labels.length >= 3) return `${labels[2]}.ac.uk`
  return undefined
}
