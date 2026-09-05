import { NextResponse, type NextRequest } from 'next/server'

/**
 * Embed mode: ?embed=1 flips the app into chrome-less microfrontend operation
 * (no sidebar, compact shell). The cookie is only used to keep the choice
 * across in-iframe client navigations; on a direct (top-level) browser visit
 * we drop it so a stray cookie never strands a user in chrome-less mode.
 *
 * "Direct" is detected via Sec-Fetch-Dest (browsers send "document" for a
 * top-level navigation, "iframe" for an iframe load). When the request is a
 * top-level document fetch and ?embed=1 is not present, we clear the cookie.
 */
export function middleware(request: NextRequest) {
  const url = new URL(request.url)
  const explicitEmbed = url.searchParams.get('embed') === '1'
  const cookieEmbed = request.cookies.get('carbon_embed')?.value === '1'
  const fetchDest = request.headers.get('sec-fetch-dest') ?? ''
  const isIframe = fetchDest === 'iframe'
  const isTopLevelDoc = fetchDest === 'document' || fetchDest === ''

  const wantsEmbed = explicitEmbed || (cookieEmbed && isIframe)

  const requestHeaders = new Headers(request.headers)
  if (wantsEmbed) requestHeaders.set('x-carbon-embed', '1')

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  if (explicitEmbed) {
    // cross-site hosts (e.g. vercel.app child under a custom-domain parent)
    // require SameSite=None; local http dev falls back to Lax
    response.cookies.set('carbon_embed', '1', {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  } else if (cookieEmbed && isTopLevelDoc) {
    // Drop a stray cookie when the user is opening the app directly (not in
    // an iframe) so they don't get stuck in chrome-less mode forever.
    response.cookies.set('carbon_embed', '', {
      path: '/',
      maxAge: 0,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/structure).*)'],
}
