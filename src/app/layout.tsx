import type { Metadata } from "next";
import { dmSans, instrumentSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andiamo",
  description: "Plan first, then tune: a three-day Italy itinerary in one click.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${instrumentSerif.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
