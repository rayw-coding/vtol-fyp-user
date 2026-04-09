import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VTOL User Portal",
  description: "User ordering portal for drone-assisted medicine delivery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
