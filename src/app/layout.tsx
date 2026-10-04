import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { getEnv } from "@/lib/env";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TokenKitchen",
  description: "Restaurant operations, made clear.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey } = getEnv();

  return (
    <html lang="en">
      <body>
        {publishableKey ? <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}
