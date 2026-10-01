import { notFound } from "next/navigation";
import { Workspace } from "@/components/trace/Workspace";
import { isTraceId } from "@/lib/trace/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "TRACE — Workspace", robots: { index: false, follow: false } };

export default async function TracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTraceId(id)) notFound();
  return <Workspace id={id} />;
}
