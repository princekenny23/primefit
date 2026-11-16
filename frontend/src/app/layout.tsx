import type { Metadata } from "next";
import { AppProvider } from "@/providers/app-provider";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrimeFit — Find your flow",
  description: "Move at your pace, find your community, and celebrate every step with PrimeFit.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col"><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
