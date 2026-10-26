// Words the demo itself adds around the app (the app's own words come from its dictionaries).
import type { Locale } from './bus';

const STRINGS = {
  savedInDemo: ['Saved in the demo', 'Αποθηκεύτηκε στο demo'],
  filtersNote: ['Search and filters work in the full app', 'Η αναζήτηση και τα φίλτρα λειτουργούν στην πλήρη εφαρμογή'],
  downloadsUnavailable: ['Downloads are not available in this view', 'Οι λήψεις δεν είναι διαθέσιμες σε αυτή την προβολή'],
  downloadBusy: ['A download is already waiting for your answer', 'Μια λήψη περιμένει ήδη την απάντησή σας'],
  downloadFailed: ['The download did not start, try again', 'Η λήψη δεν ξεκίνησε, δοκιμάστε ξανά'],
  pdfOnlySamples: ['PDFs are ready for the sample reports; a report made in the demo has none yet', 'Τα PDF είναι έτοιμα για τα δείγματα αναφορών· μια αναφορά που φτιάχτηκε στο demo δεν έχει ακόμη'],
  aiNotUsed: ['Claude was not used for this card', 'Το Claude δεν χρησιμοποιήθηκε για αυτή την κάρτα'],
  usePdfDownload: ['Printing is not available here; use Download PDF', 'Η εκτύπωση δεν είναι διαθέσιμη εδώ· χρησιμοποιήστε τη Λήψη PDF'],
  backToApp: ['← Back to the app', '← Πίσω στην εφαρμογή'],
  emailReport: ['Email this report', 'Αποστολή αναφοράς με email'],
  emailDashboard: ['Email this dashboard', 'Αποστολή πίνακα με email'],
  deleteReport: ['Delete report', 'Διαγραφή αναφοράς'],
  deleteDashboard: ['Delete dashboard', 'Διαγραφή πίνακα'],
  sharingDisabled: ['Sharing is disabled', 'Η κοινοποίηση είναι απενεργοποιημένη'],
  snapshot: ['snapshot', 'στιγμιότυπο'],
  bootFailed: ['The demo could not start. Reload the page to try again.', 'Το demo δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'],
  resetDemo: ['Reset demo', 'Επαναφορά demo'],
  resetDone: ['The demo is back to its starting point', 'Το demo επανήλθε στην αρχική του κατάσταση'],
  notInDemo: ['Not available in the demo', 'Δεν είναι διαθέσιμο στο demo'],
  notInDemoHint: ['This screen exists in the full app.', 'Αυτή η οθόνη υπάρχει στην πλήρη εφαρμογή.'],
  back: ['Back', 'Πίσω'],
  createdInDemo: ['Created in this demo', 'Δημιουργήθηκαν σε αυτό το demo'],
  linkCopied: ['Client link copied', 'Ο σύνδεσμος πελάτη αντιγράφηκε'],
  loading: ['Loading…', 'Φόρτωση…'],
  loadFailed: ['This screen could not be loaded.', 'Δεν ήταν δυνατή η φόρτωση αυτής της οθόνης.'],
  demoIntro: ['Interactive demo with sample data. Sign in with the details below.', 'Διαδραστικό demo με δείγματα δεδομένων. Συνδεθείτε με τα στοιχεία παρακάτω.'],
  deleted: ['Deleted in the demo', 'Διαγράφηκε στο demo'],
  sampleData: ['Demo · sample data', 'Demo · δείγματα δεδομένων'],
  demoPassword: ['Demo password:', 'Κωδικός demo:'],
  worksInFullApp: ['This button works in the full app', 'Αυτό το κουμπί λειτουργεί στην πλήρη εφαρμογή'],
} as const;

export type DemoKey = keyof typeof STRINGS;

export function demoT(locale: Locale, key: DemoKey): string {
  return STRINGS[key][locale === 'el' ? 1 : 0];
}
