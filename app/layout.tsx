import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Life Clock",
  description: "Koľko času Ti ostáva?"
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="sk">
      <body className="bg-slate-50">{children}</body>
    </html>
  )
}
