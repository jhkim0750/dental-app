import "@/app/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dental Orthodontic Shell Work Note",
  description:
    "Chairside planning tool for orthodontic shell work notes and tooth movements."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}

