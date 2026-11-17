import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-bengali";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Howlader Battery",
    template: "%s | Howlader Battery",
  },
  description:
    "The connected workspace for Howlader Battery House — inventory, sales, and battery traceability.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Extensions can add attributes to both document roots before React loads.
    <html lang="bn" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
