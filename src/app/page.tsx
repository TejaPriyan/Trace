import { Landing } from "@/components/trace/Landing";

export default function Home() {
  return <><Landing /><footer className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted"><nav aria-label="Site information" className="flex flex-wrap gap-5">{[["guides/index.html","Guides"],["about.html","About"],["contact.html","Contact"],["privacy.html","Privacy"],["terms.html","Terms"]].map(([path,label]) => <a key={path} href={`/${path}`} className="underline underline-offset-4">{label}</a>)}</nav></footer></>;
}
