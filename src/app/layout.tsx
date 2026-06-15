import type { ReactNode } from "react";

/**
 * Layout racine minimal — la locale est gérée dans [locale]/layout.tsx.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
