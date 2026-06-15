/**
 * @file route.ts
 * @description Déconnexion Supabase Auth.
 */

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const response = NextResponse.redirect(`${origin}/fr/login`);
  const supabase = createRouteHandlerClient(request, response);

  await supabase.auth.signOut();
  revalidatePath("/", "layout");

  return response;
}
