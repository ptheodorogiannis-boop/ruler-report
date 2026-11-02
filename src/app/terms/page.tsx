// Public terms of service, linked from the Google consent screen and the public pages.
import type { Metadata } from 'next';
import { LegalArticle, LegalSection, PublicFrame } from '@/components/public-frame';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Terms of service', description: `The terms for using ${LEGAL.product}.`, alternates: { canonical: '/terms' }, robots: { index: true, follow: true } };

const ext = 'link font-medium';

export default function TermsPage() {
  return (
    <PublicFrame narrow>
      <LegalArticle title="Terms of service">
        <LegalSection title="The service">
          <p>
            {LEGAL.product} is a reporting tool operated by {LEGAL.entity}. Access is by invitation: our team and the clients we invite use it to view
            reports, dashboards and goals built from their marketing accounts.
          </p>
        </LegalSection>
        <LegalSection title="Your account">
          <p>Keep your sign-in details to yourself. Workspace administrators decide who has access and with which role, and can remove access at any time.</p>
        </LegalSection>
        <LegalSection title="Connected accounts">
          <p>
            Connect only Google, Meta or other accounts you are allowed to use for reporting. Their own terms keep applying, including the{' '}
            <a href="https://policies.google.com/terms" className={ext}>
              Google Terms of Service
            </a>
            , the{' '}
            <a href="https://www.youtube.com/t/terms" className={ext}>
              YouTube Terms of Service
            </a>{' '}
            and{' '}
            <a href="https://www.facebook.com/legal/terms" className={ext}>
              Meta's Terms
            </a>
            . {LEGAL.product} reads data from them and does not change anything in them.
          </p>
        </LegalSection>
        <LegalSection title="Acceptable use">
          <p>Do not try to reach other workspaces' data, break the service's security, or use it to send unsolicited messages.</p>
        </LegalSection>
        <LegalSection title="Your data">
          <p>
            How we handle personal data and the data read from connected accounts is described in the{' '}
            <a href="/privacy" className={ext}>
              privacy policy
            </a>
            .
          </p>
        </LegalSection>
        <LegalSection title="Availability and liability">
          <p>
            We work to keep {LEGAL.product} available and its figures accurate, but provide it as it is. Figures come from the connected platforms and can
            differ from what those platforms show later. To the extent the law allows, {LEGAL.entity} is not liable for indirect or consequential loss.
          </p>
        </LegalSection>
        <LegalSection title="Changes and law">
          <p>We may update these terms and will change the date at the top when we do. Greek law applies, and the competent courts of Greece have jurisdiction.</p>
        </LegalSection>
        <LegalSection title="Contact">
          <p>
            <a href={`mailto:${LEGAL.email}`} className={ext}>
              {LEGAL.email}
            </a>
          </p>
        </LegalSection>
      </LegalArticle>
    </PublicFrame>
  );
}
