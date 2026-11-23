import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "منصة المتفوقين", template: "%s · منصة المتفوقين" },
  description: "منصة تعليمية للمناهج العراقية الرسمية من الصف الأول إلى الصف السادس الابتدائي",
};

export const viewport: Viewport = {
  themeColor: "#5b46e0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
