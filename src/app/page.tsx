import Link from "next/link";
import { SetupForm } from "./setup-form";
import { Logo } from "@/components/andiamo";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1164px] flex-col gap-8 px-6 py-12">
      <Logo />
      <h1 className="font-display text-display">Where to?</h1>
      <SetupForm />
      <footer className="text-meta text-ink-muted">
        <Link href="/credits" className="underline">Photo credits</Link>
      </footer>
    </main>
  );
}
