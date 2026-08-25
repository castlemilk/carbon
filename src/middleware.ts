import { NextResponse, type NextRequest } from 'next/server'

/**
 * Embed mode: ?embed=1 flips the app into chrome-less microfrontend operation
 * (no sidebar, compact shell) and remembers the choice in a cookie so
 * client-side navigations inside the iframe keep it.
 */
export function middleware(request: NextRequest) {
  const url = new URL(request.url)
  const wantsEmbed =
    url.searchParams.get('embed') === '1' ||
    request.cookies.get('carbon_embed')?.value === '1'

  const requestHeaders = new Headers(request.headers)
  if (wantsEmbed) requestHeaders.set('x-carbon-embed', '1')

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  if (url.searchParams.get('embed') === '1') {
    // cross-site hosts (e.g. vercel.app child under a custom-domain parent)
    // require SameSite=None; local http dev falls back to Lax
    response.cookies.set('carbon_embed', '1', {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/structure).*)'],
}
