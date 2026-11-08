import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "WriteOn | Your words, your voice",
  description: "Capture handwriting with a paired phone, review your words, and choose when they are spoken.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
