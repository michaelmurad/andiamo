import { DM_Sans, Instrument_Serif } from "next/font/google";

// Add both variables to <html> in app/layout.tsx:
//   <html lang="en" className={`${dmSans.variable} ${instrumentSerif.variable}`}>
export const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
export const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument-serif" });
