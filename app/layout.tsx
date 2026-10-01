import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Culture & Mist — Fashion and Fragrance Marketplace',description:'Buy and sell fashion and fragrance in a community marketplace.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
