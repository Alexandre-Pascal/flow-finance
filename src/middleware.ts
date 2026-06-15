/**
 * @file middleware.ts
 * @description Middleware Next.js : routage i18n (next-intl).
 * Le refresh de session Supabase est géré dans les Server Components.
 */

import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createIntlMiddleware(routing);

export const config = {
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
