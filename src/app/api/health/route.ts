/**
 * @file route.ts
 * @description Health check pour monitoring et déploiement.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "flow-finance",
    timestamp: new Date().toISOString(),
  });
}
