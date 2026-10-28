import Script from 'next/script';
export default function Page(){
  return <><a className="skip-link" href="#main">Skip to content</a><div id="app"><main id="main" className="initial-loading"><div className="brand-mark">✦</div><h1>CareerOS</h1><p>Opening your private workspace…</p></main></div><div id="toast" role="status" aria-live="polite"/><dialog id="modal" aria-labelledby="modal-title"/><Script src="/app.mjs" type="module" strategy="afterInteractive"/></>;
}
