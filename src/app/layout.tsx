import type { Metadata } from 'next'
import { Inter, Anton } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/hooks/useAuth'
import { ViewTransitionInterceptor } from '@/components/ViewTransitions'

const inter = Inter({ subsets: ['latin'] })
const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton' })

export const metadata: Metadata = {
  title: "Doc's Design Generator",
  description: 'Generate listing designs for Amazon, eBay, and Shopify',
  icons: {
    icon: '/Favicon.png',
    apple: '/Favicon.png',
  },
  openGraph: {
    images: [{ url: '/Social Sharing.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/Social Sharing.png'],
  },
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
          <ViewTransitionInterceptor />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
