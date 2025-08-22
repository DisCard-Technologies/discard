import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Check if the request is for a dashboard route
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    // Redirect to home page
    return NextResponse.redirect(new URL('/', request.url))
  }
}

// Configure which routes the middleware should run on
export const config = {
  matcher: '/dashboard/:path*'
}