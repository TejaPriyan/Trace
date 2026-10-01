import { NextResponse } from "next/server";
import { getTraceState, isTraceId } from "@/lib/trace/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isTraceId(id)) return NextResponse.json({ status: "missing" }, { status: 404 });
  const state = await getTraceState(id);
  if (state.status === "missing") return NextResponse.json(state, { status: 404 });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
