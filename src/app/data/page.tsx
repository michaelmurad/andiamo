import type { Metadata } from "next";
import Link from "next/link";
import { Logo, Photo } from "@/components/andiamo";
import { PLACES, REJECTED } from "@/lib/data/places";
import type { IssueAction } from "@/lib/data/types";
import { kindOf } from "@/lib/plan/view";

export const metadata: Metadata = { title: "Data quality · Andiamo" };

const ACTION_LABEL: Record<IssueAction, string> = { fixed: "Fixed", flagged: "Flagged", excluded: "Excluded" };

/** Every problem the normalizer found in italy.json, straight from its output, so it can't drift. */
export default function DataPage() {
  const issues = PLACES.flatMap((p) => p.issues);
  const count = (action: IssueAction) => issues.filter((i) => i.action === action).length;
  const byCode = [...Map.groupBy(issues, (i) => i.code)].sort((a, b) => b[1].length - a[1].length);

  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-6 py-12">
      <Link href="/"><Logo /></Link>
      <header>
        <h1 className="font-display text-display">Data quality</h1>
        <p className="mt-2 text-body text-ink-muted">
          {PLACES.length} places kept, {REJECTED.length} rejected. {count("fixed")} fixes, {count("flagged")} flags,{" "}
          {count("excluded")} excluded from automatic plans. The source file is never edited; this list is the
          normalizer&apos;s output.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-overline uppercase text-ink-muted">By kind</h2>
        <ul className="flex flex-wrap gap-2">
          {byCode.map(([code, list]) => (
            <li key={code} className="rounded-pill bg-surface-sunken px-3 py-1 text-label">
              {code} <span className="text-ink-muted">{list.length}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-overline uppercase text-ink-muted">By place</h2>
        {PLACES.filter((p) => p.issues.length).map((p) => (
          <article key={p.id} className="flex gap-3 rounded-lg bg-surface-raised p-3 shadow-card">
            <Photo kind={kindOf(p)} sizes="56px" className="an-thumb" />
            <div className="min-w-0 flex-1">
              <h3 className="text-card-title">
                {p.name} <span className="text-meta text-ink-muted">{p.id}</span>
              </h3>
              <ul className="mt-1 flex flex-col gap-1">
                {p.issues.map((issue, i) => (
                  <li key={i} className="text-caption">
                    <span className={issue.action === "fixed" ? "font-semibold text-brand" : "font-semibold text-warning"}>
                      {ACTION_LABEL[issue.action]}
                    </span>{" "}
                    <span className="text-ink-muted">{issue.field}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
