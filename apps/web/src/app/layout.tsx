import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-bengali";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Hawlader Battery ERP",
    template: "%s | Hawlader Battery ERP",
  },
  description:
    "The connected workspace for Hawlader Battery House — inventory, sales, and battery traceability.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
