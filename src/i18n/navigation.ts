/**
 * @file navigation.ts
 * @description Helpers Link / redirect / usePathname typés avec la locale active.
 */

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
