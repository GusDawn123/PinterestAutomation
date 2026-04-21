import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth bypassed for local UI preview
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
