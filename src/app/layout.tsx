import type {Metadata} from 'next';
export const metadata:Metadata={title:'CareerOS · Your next chapter',description:'Your private career intelligence workspace',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="en" data-theme="light" suppressHydrationWarning><head><link rel="stylesheet" href="/styles.css"/></head><body>{children}</body></html>;
}
