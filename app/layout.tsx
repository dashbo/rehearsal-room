import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Choir Practice",
  description:
    "Upload a score and rehearse your part — play at any tempo, mute or solo any voice.",
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
