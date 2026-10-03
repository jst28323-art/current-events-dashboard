// Only https URLs become links (docs/EVENT_MODEL.md: every source URL is https). Anything else (javascript:, data:,
// http:, relative, credentials in the URL, unparseable) is withheld: the row says so instead of linking it.

/** The normalized href when `url` is a plain https URL, else null. */
export function safeHttpsUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  if (u.username !== '' || u.password !== '') return null
  if (u.hostname === '') return null
  return u.href
}

/** "federalregister.gov" for a link label (leading "www." dropped). */
export function linkHost(href: string): string {
  return new URL(href).hostname.replace(/^www\./, '')
}
