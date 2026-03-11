import "@/app/globals.css";
import type { Metadata } from "next";
// ✨ [추가됨] 방금 만든 문지기 파일을 불러옵니다.
import { AuthProvider } from "@/components/auth-provider"; 

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
        {/* ✨ [추가됨] 기존 앱(children)을 문지기로 감싸줍니다. */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}