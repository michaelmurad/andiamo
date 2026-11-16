import type { Metadata } from "next";
import Link from "next/link";
import { Logo, Photo } from "@/components/andiamo";
import { photoCredits } from "@/lib/photos";

export const metadata: Metadata = { title: "Photo credits · Andiamo" };

/** Attribution for every Wikimedia Commons photo the app shows, as their licences require. */
export default function CreditsPage() {
  const credits = photoCredits();
  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-6 py-12">
      <Link href="/"><Logo /></Link>
      <header>
        <h1 className="font-display text-display">Photo credits</h1>
        <p className="mt-2 text-body text-ink-muted">
          Place photos come from Wikimedia Commons and are used under the licences below. Places without a freely
          licensed photo show a drawn scene instead.
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        {credits.map((c) => (
          <li key={c.file} className="flex items-center gap-3 rounded-lg bg-surface-raised p-3 shadow-card">
            <Photo src={c.src} alt={c.title} sizes="56px" className="an-thumb" />
            <div className="min-w-0 flex-1">
              <h2 className="text-card-title">{c.title}</h2>
              <p className="text-caption text-ink-muted">
                <a href={c.source} className="underline">{c.credit}</a>
                {" · "}
                {c.licenseUrl ? <a href={c.licenseUrl} className="underline">{c.license}</a> : c.license}
                {" · "}
                <span>Cropped</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
