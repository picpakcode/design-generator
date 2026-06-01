import type { Metadata } from 'next'
import { Inter, Anton } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/hooks/useAuth'

const inter = Inter({ subsets: ['latin'] })
const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton' })

export const metadata: Metadata = {
  title: 'Design Generator',
  description: 'Generate listing designs for Amazon, eBay, and Shopify',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Reads localStorage before first paint to avoid dark-mode flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{var s=JSON.parse(localStorage.getItem('dg:settings')||'{}');if(s.theme==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body className={`${inter.className} ${anton.variable} min-h-screen bg-gray-50 dark:bg-gray-950`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
