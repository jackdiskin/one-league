import { NextRequest, NextResponse } from 'next/server';

// POST /api/admin/prices/reset
// Disabled — prices are frozen until a new pricing formula is provided.
// This route used to move every player's price at the start of a new week
// (see git history for the prior implementation); do not re-enable without
// an explicit go-ahead.
export async function POST(_request: NextRequest) {
  return NextResponse.json({ error: 'Price resets are disabled — prices are frozen' }, { status: 410 });
}
