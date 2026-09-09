import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { isRelativeUrl } from "@/utils";

export async function GET(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  const slug = params.get("slug");
  // `slug` is attacker-controllable and `redirect` will follow it off-origin.
  const redirectUrl = slug && isRelativeUrl(slug) ? slug : "/";

  (await draftMode()).disable();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  redirect(redirectUrl);
}
