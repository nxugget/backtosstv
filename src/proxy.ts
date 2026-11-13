import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { requireEnv } from "@/lib/env";
import { SHACK_BOOTSTRAP_PATH, SHACK_LOGIN_PATH } from "@/lib/shack";

const OPEN_PATHS = new Set<string>([SHACK_LOGIN_PATH, SHACK_BOOTSTRAP_PATH]);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, options, value } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (OPEN_PATHS.has(request.nextUrl.pathname)) {
    return response;
  }

  if (user === null) {
    return redirectTo(request, response, SHACK_LOGIN_PATH);
  }

  const { data: admin } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (admin === null) {
    return redirectTo(request, response, `${SHACK_LOGIN_PATH}?error=unauthorized`);
  }

  return response;
}

export const config = {
  matcher: ["/shack", "/shack/:path*"],
};

function redirectTo(request: NextRequest, response: NextResponse, location: string): NextResponse {
  const redirect = NextResponse.redirect(new URL(location, request.nextUrl.origin));

  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}
