// The sign-in screen: the app's own LoginForm, with the demo credentials shown and an English/Greek switch.
import { LoginForm } from '@/components/login-form';
import { bus, type Locale } from '../bus';
import { demoT } from '../demo-strings';

export function LoginView({ locale }: { locale: Locale }) {
  return (
    <div className="relative" data-live-page>
      <div className="absolute right-4 top-4 z-10 flex gap-1 text-xs" style={{ right: 'max(16px, env(safe-area-inset-right, 0px))' }}>
        {(['en', 'el'] as const).map((l) => (
          <button key={l} type="button" className={`btn px-2 py-1 text-xs ${l === locale ? 'border-brand text-brand' : ''}`} aria-pressed={l === locale} onClick={() => bus.setLocale(l)}>
            {l === 'en' ? 'EN' : 'ΕΛ'}
          </button>
        ))}
      </div>
      <LoginForm
        demoHint={
          <>
            {demoT(locale, 'demoIntro')}{' '}
            <code>admin@demo.local</code> / <code>demo1234</code>
          </>
        }
      />
    </div>
  );
}
