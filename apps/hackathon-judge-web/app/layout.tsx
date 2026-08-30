import type { Metadata } from 'next';
import { DM_Mono, Manrope, Newsreader } from 'next/font/google';
import './globals.css';

const sans = Manrope({ variable: '--font-sans', subsets: ['latin'] });
const display = Newsreader({ variable: '--font-display', subsets: ['latin'] });
const mono = DM_Mono({ variable: '--font-mono', subsets: ['latin'], weight: ['400', '500'] });

export const metadata: Metadata = {
  title: 'Hackathon Judge — GenLayer-native judging',
  description: 'An on-chain jury for evidence-based hackathon decisions, appeals, prizes, and portable builder credentials.',
  openGraph: {
    title: 'Hackathon Judge',
    description: 'Rules → evidence → validator consensus. Live on GenLayer StudioNet.',
    images: [{ url: '/hackathon-judge-social.png', width: 1792, height: 1024, alt: 'Hackathon Judge — rules, evidence, consensus' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hackathon Judge',
    description: 'A GenLayer-native jury protocol for hackathons.',
    images: ['/hackathon-judge-social.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
