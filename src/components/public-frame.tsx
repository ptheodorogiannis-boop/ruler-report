// The frame of the three public pages (home for signed-out visitors, privacy policy, terms): the product name, a
// sign-in link, the page, and a footer with the operator and the legal links. No app shell, no client JavaScript.
import Link from 'next/link';
import { LEGAL } from '@/lib/legal';

export function PublicFrame({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="border-b border-[var(--line)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-4 md:px-8">
          <Link href="/" className="display text-[17px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
            {LEGAL.product}
          </Link>
          <Link href="/login" className="btn">
            Sign in
          </Link>
        </div>
      </header>
      <main id="main" className={`mx-auto w-full flex-1 px-4 py-12 md:px-8 md:py-16 ${narrow ? 'max-w-[760px]' : 'max-w-[1120px]'}`}>
        {children}
      </main>
      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-ink-2 md:px-8">
          <span>
            {LEGAL.product} is operated by {LEGAL.entity}
          </span>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy" className="link">
              Privacy policy
            </Link>
            <Link href="/terms" className="link">
              Terms of service
            </Link>
            <a href={`mailto:${LEGAL.email}`} className="link">
              {LEGAL.email}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Long-form legal text: headings and paragraphs in the app's type, readable line length. */
export function LegalArticle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="legal text-[15px] leading-7 text-ink">
      <h1 className="display text-[clamp(28px,3vw,36px)] font-semibold leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-ink-2">Last updated: {LEGAL.updated}</p>
      <div className="mt-8 space-y-8">{children}</div>
    </article>
  );
}

export function LegalSection({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="display text-xl font-semibold leading-7">{title}</h2>
      {children}
    </section>
  );
}
