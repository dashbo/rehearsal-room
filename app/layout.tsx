import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rehearsal Room",
  description:
    "Add a score and rehearse your part — play at any tempo, mute any part, loop a section.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
