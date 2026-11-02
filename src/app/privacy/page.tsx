// Public privacy policy. Google's OAuth verification checks it for: what Google data is accessed and why, how it is
// stored, shared and deleted, the Limited Use statement, and (YouTube API Services) links to the YouTube Terms and the
// Google Privacy Policy. Keep it true to what the code does when the code changes.
import type { Metadata } from 'next';
import { LegalArticle, LegalSection, PublicFrame } from '@/components/public-frame';
import { GOOGLE_SCOPE_USES, LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Privacy policy', description: `How ${LEGAL.product} handles personal data and the Google and Meta data it reads.`, alternates: { canonical: '/privacy' }, robots: { index: true, follow: true } };

const ext = 'link font-medium';

export default function PrivacyPage() {
  return (
    <PublicFrame narrow>
      <LegalArticle title="Privacy policy">
        <LegalSection title="Who we are">
          <p>
            {LEGAL.product} is a reporting tool operated by {LEGAL.entity} (“we”). Our team uses it to build marketing reports and dashboards for our
            clients from data in their advertising, analytics and social accounts. {LEGAL.entity} is the data controller for the personal data described
            here. Questions and requests: <a href={`mailto:${LEGAL.email}`} className={ext}>{LEGAL.email}</a>.
          </p>
        </LegalSection>

        <LegalSection title="What we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="font-semibold">Workspace accounts.</strong> The name, email address, role and a hashed password of each person with access
              to a workspace.
            </li>
            <li>
              <strong className="font-semibold">Connected accounts.</strong> When someone connects a Google or Meta account, the access granted for it (an
              OAuth refresh or access token) and the identifiers and names of the accounts, properties, sites, channels, locations, Pages and ad accounts
              they choose to connect.
            </li>
            <li>
              <strong className="font-semibold">Report data.</strong> The performance figures read from those accounts when a report or dashboard is built.
              Reports keep a copy of their figures so a sent report does not change afterwards.
            </li>
            <li>
              <strong className="font-semibold">Cookies.</strong> A sign-in session cookie, a short-lived cookie that holds a connection while you pick
              accounts (15 minutes), and a cookie that remembers a client link you unlocked with its password. No advertising or analytics cookies.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="Google user data">
          <p>
            When you choose <em className="not-italic font-medium">Connect with Google</em>, you sign in on Google's own page and grant read-only access.
            {` ${LEGAL.product}`} reads only what is needed to show the data in reports:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line-strong)] text-left">
                  <th className="py-2 pr-4 font-semibold">Google product</th>
                  <th className="py-2 font-semibold">What we read and why</th>
                </tr>
              </thead>
              <tbody>
                {GOOGLE_SCOPE_USES.map((s) => (
                  <tr key={s.scope} className="border-b border-[var(--line)] align-top">
                    <td className="py-2 pr-4 font-medium">{s.product}</td>
                    <td className="py-2 text-ink-2">{s.reads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>We also receive your email address from Google, to show which Google account a connection belongs to.</p>
          <p>
            <strong className="font-semibold">
              {LEGAL.product.endsWith('s') ? `${LEGAL.product}'` : `${LEGAL.product}'s`} use and transfer to any other app of information received from Google APIs will adhere to the{' '}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className={ext}>
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </strong>
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>We use Google user data only to provide and improve the reports and dashboards you see in {LEGAL.product}.</li>
            <li>We do not sell it, use it for advertising, or use it to build user profiles for any other purpose.</li>
            <li>We do not use it to develop, improve or train generalised artificial intelligence or machine-learning models.</li>
            <li>We do not transfer it to others except as described under “Who sees the data”, to comply with the law, or with your consent.</li>
          </ul>
        </LegalSection>

        <LegalSection title="YouTube">
          <p>
            {LEGAL.product} uses YouTube API Services. By connecting a YouTube channel you agree to the{' '}
            <a href="https://www.youtube.com/t/terms" className={ext}>
              YouTube Terms of Service
            </a>
            , and Google's handling of the data is described in the{' '}
            <a href="https://policies.google.com/privacy" className={ext}>
              Google Privacy Policy
            </a>
            .
          </p>
        </LegalSection>

        <LegalSection title="Meta data">
          <p>
            When you choose <em className="not-italic font-medium">Connect with Meta</em>, you sign in with Facebook and grant access to read insights:
            ad account performance (Marketing API), Facebook Page insights and posts, and Instagram business account insights and media, including those
            you manage through a Business Portfolio. {LEGAL.product} does not post, comment, message or change any campaign.
          </p>
        </LegalSection>

        <LegalSection title="Who sees the data">
          <ul className="list-disc space-y-2 pl-5">
            <li>The people with access to the workspace the account was connected to.</li>
            <li>The people the workspace chooses to share a report or dashboard with, by link or by email.</li>
            <li>
              Service providers that run {LEGAL.product} for us under contract: hosting and database providers, the email provider that sends scheduled
              reports and, only where AI analysis is switched on, Anthropic, which receives the report's figures and labels to write commentary. They
              receive no account passwords or Google or Meta tokens.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="Storage and security">
          <p>
            The tokens a connection grants are encrypted (AES-256-GCM) before they are stored and are used only by the server to fetch report data.
            Data travels over HTTPS.
            Access inside a workspace is limited by role, and each workspace sees only its own data.
          </p>
        </LegalSection>

        {/* Meta's "data deletion instructions URL" points here (docs/GOOGLE-VERIFICATION.md) */}
        <LegalSection title="How long we keep it and how to remove it" id="delete-data">
          <ul className="list-disc space-y-2 pl-5">
            <li>Removing a connected account in {LEGAL.product} deletes its stored token straight away.</li>
            <li>Reports keep their figures until the report is deleted. Workspace accounts are kept until they are removed.</li>
            <li>
              You can withdraw access at any time: for Google at{' '}
              <a href="https://myaccount.google.com/permissions" className={ext}>
                myaccount.google.com/permissions
              </a>
              , for Meta in Facebook settings under{' '}
              <a href="https://www.facebook.com/settings?tab=business_tools" className={ext}>
                Business integrations
              </a>
              .
            </li>
            <li>
              To have your data deleted, email <a href={`mailto:${LEGAL.email}`} className={ext}>{LEGAL.email}</a>. We do it within 30 days.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="Your rights">
          <p>
            You can ask to access, correct, delete or export your personal data, or object to or restrict how it is used, by emailing{' '}
            <a href={`mailto:${LEGAL.email}`} className={ext}>
              {LEGAL.email}
            </a>
            . You can also complain to the{' '}
            <a href={LEGAL.authority.url} className={ext}>
              {LEGAL.authority.name}
            </a>
            .
          </p>
        </LegalSection>

        <LegalSection title="Changes">
          <p>We will update this page when what we collect or how we use it changes, and change the date at the top.</p>
        </LegalSection>
      </LegalArticle>
    </PublicFrame>
  );
}
