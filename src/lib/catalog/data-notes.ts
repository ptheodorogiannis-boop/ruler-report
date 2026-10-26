// "About these numbers" (spec v3 §1.4): why a figure in a report can differ from the platform's own interface, said once per
// platform in plain words. Static per slug; the engine adds nothing. Unknown slugs get the generic sentence only.

export interface DataNote {
  attribution?: string;
  timezone: string;
  delay?: string;
  sampling?: string;
  counting?: string;
}

export const GENERIC_DATA_NOTE =
  "Numbers come from each platform's API at generation time and can differ from its interface because of attribution windows, time zones and late conversions.";

const ADS_TZ = "Dates follow the ad account's time zone.";

export const DATA_NOTES: Record<string, DataNote> = {
  facebook_ads: {
    attribution: "Conversions use the ad account's attribution window (7-day click, 1-day view by default); Ads Manager may show another window.",
    timezone: ADS_TZ,
    delay: 'Figures for the last 72 hours are still being updated by Meta.',
    counting: 'Reach is fetched as a true period total, so it is not the sum of the daily values.',
  },
  instagram_business: {
    timezone: 'Dates follow UTC as the Instagram API reports them.',
    delay: 'Insights for the last 48 hours can still change, and Instagram keeps account insights for about 90 days, so older days are empty.',
    counting:
      'Reach is one total for the period, not the sum of daily values. Views stand in for impressions, which Instagram retired. “New followers” is the net daily change (Instagram does not report unfollows), and the follower count is rebuilt backwards from today’s number. Audience charts show current followers (top 45 values, accounts with 100+ followers). The “followers online by hour” chart is not available.',
  },
  facebook: {
    timezone: "Dates follow the Page's time zone.",
    delay: 'Insights for the last 48 hours can still change.',
    counting:
      'Reach is one total for the period, not the sum of daily values. Views and impressions both use Meta’s “media views”. Meta no longer provides audience demographics, link clicks or saves for Pages, so those charts are empty (saves show as 0 in the top posts table). Comments, shares and the post count are dated by the day a post was published.',
  },
  youtube: {
    timezone: 'Dates follow Pacific time as YouTube Analytics reports them.',
    delay: 'YouTube Analytics is a day or two behind, so the last days of a period are usually incomplete.',
    counting:
      'YouTube does not give channel impressions or the impressions click-through rate to apps, so those figures are not available. Views by age and gender are the channel total split by the share of views YouTube reports for each group. The subscriber count is rebuilt backwards from today’s number using daily gains and losses, and YouTube rounds that number down to three significant figures, so the whole series can sit slightly below the true count.',
  },
  google_my_business: {
    timezone: "Dates follow the location's time zone.",
    delay: 'Performance figures are a few days behind.',
    counting:
      'Days with no activity are shown as zero. Search terms are monthly totals for the months the period touches, and a term below Google’s privacy limit shows that limit. The rating is the current average on every day, and new reviews are counted by the day they were posted.',
  },
  google_adwords: {
    attribution: "Conversions use the conversion actions' own attribution models and windows, so they can keep rising for up to 30 days.",
    timezone: ADS_TZ,
    delay: 'Figures for the last 3 days are still being finalised by Google.',
  },
  tiktok_ads: {
    attribution: "Conversions follow the account's attribution window (7-day click, 1-day view by default).",
    timezone: ADS_TZ,
    delay: 'Figures for the last 48 hours can still change.',
  },
  linkedin_ads: {
    attribution: 'Conversions use a 30-day click and 7-day view window by default.',
    timezone: 'Dates follow UTC as the LinkedIn API reports them.',
  },
  google_analytics_4: {
    attribution: "Conversions and channels follow the property's attribution model (data-driven by default).",
    timezone: "Dates follow the GA4 property's time zone.",
    sampling: 'Google may apply sampling or thresholding to small segments, so detailed breakdowns can differ from the totals.',
    delay: 'Data for the last 24 to 48 hours is still being processed.',
  },
  search_console: {
    timezone: 'Dates follow Pacific time as Search Console reports them.',
    delay: 'Search Console data arrives 2 to 3 days late, so the last days of a period are usually incomplete.',
    sampling: 'Rare queries are anonymised by Google and left out of the query table.',
  },
  woo_commerce: {
    timezone: "Dates follow the store's time zone.",
    counting: 'Orders are counted by their creation date and include every status except cancelled, failed and refunded.',
  },
  google_sheets: {
    timezone: 'Dates are read exactly as typed in the sheet.',
    counting: 'Rows are summed by the detected date column; text columns become breakdowns.',
  },
  csv_url: {
    timezone: 'Dates are read exactly as they appear in the file.',
    counting: 'Rows are summed by the detected date column; text columns become breakdowns.',
  },
  rest_api: {
    timezone: 'Dates are read exactly as the API returns them.',
    counting: 'Rows are summed by the detected date column; text columns become breakdowns.',
  },
  webhook_ingest: {
    timezone: 'Dates are the ones each pushed row carried.',
    counting: 'Rows pushed with the same date are summed.',
  },
};

for (const slug of ['make', 'n8n', 'zapier', 'pluga']) DATA_NOTES[slug] = DATA_NOTES.webhook_ingest;

// Greek (spec v3 §5): the same parts per platform; docs/i18n-review.md lists them for the native reviewer.
export const GENERIC_DATA_NOTE_EL =
  'Οι αριθμοί προέρχονται από το API κάθε πλατφόρμας τη στιγμή της δημιουργίας και μπορεί να διαφέρουν από το περιβάλλον της λόγω παραθύρων απόδοσης, ζωνών ώρας και καθυστερημένων μετατροπών.';
const ADS_TZ_EL = 'Οι ημερομηνίες ακολουθούν τη ζώνη ώρας του διαφημιστικού λογαριασμού.';
const H48_EL = 'Τα insights των τελευταίων 48 ωρών μπορεί ακόμη να αλλάξουν.';
const ROWS_EL = 'Οι γραμμές αθροίζονται ανά την ανιχνευμένη στήλη ημερομηνίας· οι στήλες κειμένου γίνονται κατανομές.';
export const DATA_NOTES_EL: Record<string, DataNote> = {
  facebook_ads: {
    attribution: 'Οι μετατροπές χρησιμοποιούν το παράθυρο απόδοσης του διαφημιστικού λογαριασμού (7 ημέρες κλικ, 1 ημέρα προβολή από προεπιλογή)· το Ads Manager μπορεί να δείχνει άλλο παράθυρο.',
    timezone: ADS_TZ_EL,
    delay: 'Τα στοιχεία των τελευταίων 72 ωρών ενημερώνονται ακόμη από τη Meta.',
    counting: 'Η απήχηση αντλείται ως πραγματικό σύνολο περιόδου, οπότε δεν είναι το άθροισμα των ημερήσιων τιμών.',
  },
  instagram_business: {
    timezone: 'Οι ημερομηνίες ακολουθούν UTC, όπως τις αναφέρει το API του Instagram.',
    delay: 'Τα insights των τελευταίων 48 ωρών μπορεί ακόμη να αλλάξουν, και το Instagram κρατά τα insights λογαριασμού για περίπου 90 ημέρες, οπότε παλαιότερες ημέρες είναι κενές.',
    counting:
      'Η απήχηση είναι ένα σύνολο για την περίοδο, όχι το άθροισμα των ημερήσιων τιμών. Οι προβολές αντικαθιστούν τις εμφανίσεις, που το Instagram κατάργησε. Οι «Νέοι ακόλουθοι» είναι η καθαρή ημερήσια μεταβολή (το Instagram δεν αναφέρει διακοπές παρακολούθησης) και ο αριθμός ακολούθων ανακατασκευάζεται προς τα πίσω από τον σημερινό. Τα γραφήματα κοινού δείχνουν τους τρέχοντες ακολούθους (κορυφαίες 45 τιμές, λογαριασμοί με 100+ ακολούθους). Το γράφημα «ακόλουθοι online ανά ώρα» δεν είναι διαθέσιμο.',
  },
  facebook: {
    timezone: 'Οι ημερομηνίες ακολουθούν τη ζώνη ώρας της Σελίδας.',
    delay: H48_EL,
    counting:
      'Η απήχηση είναι ένα σύνολο για την περίοδο, όχι το άθροισμα των ημερήσιων τιμών. Οι προβολές και οι εμφανίσεις χρησιμοποιούν τις «προβολές πολυμέσων» της Meta. Η Meta δεν παρέχει πλέον δημογραφικά κοινού, κλικ συνδέσμων ή αποθηκεύσεις για Σελίδες, οπότε αυτά τα γραφήματα είναι κενά (οι αποθηκεύσεις εμφανίζονται ως 0 στον πίνακα κορυφαίων αναρτήσεων). Τα σχόλια, οι κοινοποιήσεις και το πλήθος αναρτήσεων χρονολογούνται με την ημέρα δημοσίευσης.',
  },
  youtube: {
    timezone: 'Οι ημερομηνίες ακολουθούν την ώρα Ειρηνικού, όπως τις αναφέρει το YouTube Analytics.',
    delay: 'Το YouTube Analytics καθυστερεί μία-δύο ημέρες, οπότε οι τελευταίες ημέρες μιας περιόδου είναι συνήθως ελλιπείς.',
    counting:
      'Το YouTube δεν δίνει στις εφαρμογές εμφανίσεις καναλιού ούτε το ποσοστό κλικ εμφανίσεων, οπότε αυτά τα στοιχεία δεν είναι διαθέσιμα. Οι προβολές ανά ηλικία και φύλο είναι το σύνολο του καναλιού κατανεμημένο με βάση το ποσοστό προβολών που αναφέρει το YouTube για κάθε ομάδα. Ο αριθμός συνδρομητών ανακατασκευάζεται προς τα πίσω από τον σημερινό με τα ημερήσια κέρδη και απώλειες, και το YouTube στρογγυλοποιεί αυτόν τον αριθμό προς τα κάτω στα τρία σημαντικά ψηφία, οπότε όλη η σειρά μπορεί να βρίσκεται λίγο κάτω από τον πραγματικό αριθμό.',
  },
  google_my_business: {
    timezone: 'Οι ημερομηνίες ακολουθούν τη ζώνη ώρας της τοποθεσίας.',
    delay: 'Τα στοιχεία απόδοσης καθυστερούν μερικές ημέρες.',
    counting:
      'Οι ημέρες χωρίς δραστηριότητα εμφανίζονται ως μηδέν. Οι όροι αναζήτησης είναι μηνιαία σύνολα για τους μήνες που αγγίζει η περίοδος, και ένας όρος κάτω από το όριο απορρήτου της Google δείχνει αυτό το όριο. Η βαθμολογία είναι ο τρέχων μέσος όρος κάθε ημέρα και οι νέες κριτικές μετρώνται με την ημέρα δημοσίευσης.',
  },
  google_adwords: {
    attribution: 'Οι μετατροπές χρησιμοποιούν τα μοντέλα και τα παράθυρα απόδοσης των ίδιων των ενεργειών μετατροπής, οπότε μπορεί να αυξάνονται για έως 30 ημέρες.',
    timezone: ADS_TZ_EL,
    delay: 'Τα στοιχεία των τελευταίων 3 ημερών οριστικοποιούνται ακόμη από την Google.',
  },
  tiktok_ads: {
    attribution: 'Οι μετατροπές ακολουθούν το παράθυρο απόδοσης του λογαριασμού (7 ημέρες κλικ, 1 ημέρα προβολή από προεπιλογή).',
    timezone: ADS_TZ_EL,
    delay: 'Τα στοιχεία των τελευταίων 48 ωρών μπορεί ακόμη να αλλάξουν.',
  },
  linkedin_ads: {
    attribution: 'Οι μετατροπές χρησιμοποιούν από προεπιλογή παράθυρο 30 ημερών για κλικ και 7 ημερών για προβολή.',
    timezone: 'Οι ημερομηνίες ακολουθούν UTC, όπως τις αναφέρει το API του LinkedIn.',
  },
  google_analytics_4: {
    attribution: 'Οι μετατροπές και τα κανάλια ακολουθούν το μοντέλο απόδοσης της ιδιότητας (data-driven από προεπιλογή).',
    timezone: 'Οι ημερομηνίες ακολουθούν τη ζώνη ώρας της ιδιότητας GA4.',
    sampling: 'Η Google μπορεί να εφαρμόσει δειγματοληψία ή κατώφλια σε μικρά τμήματα, οπότε οι αναλυτικές κατανομές μπορεί να διαφέρουν από τα σύνολα.',
    delay: 'Τα δεδομένα των τελευταίων 24 έως 48 ωρών επεξεργάζονται ακόμη.',
  },
  search_console: {
    timezone: 'Οι ημερομηνίες ακολουθούν την ώρα Ειρηνικού, όπως τις αναφέρει το Search Console.',
    delay: 'Τα δεδομένα του Search Console φτάνουν με καθυστέρηση 2 έως 3 ημερών, οπότε οι τελευταίες ημέρες μιας περιόδου είναι συνήθως ελλιπείς.',
    sampling: 'Τα σπάνια ερωτήματα ανωνυμοποιούνται από την Google και λείπουν από τον πίνακα ερωτημάτων.',
  },
  woo_commerce: {
    timezone: 'Οι ημερομηνίες ακολουθούν τη ζώνη ώρας του καταστήματος.',
    counting: 'Οι παραγγελίες μετρούνται με την ημερομηνία δημιουργίας τους και περιλαμβάνουν κάθε κατάσταση εκτός από ακυρωμένες, αποτυχημένες και επιστροφές.',
  },
  google_sheets: { timezone: 'Οι ημερομηνίες διαβάζονται ακριβώς όπως είναι γραμμένες στο φύλλο.', counting: ROWS_EL },
  csv_url: { timezone: 'Οι ημερομηνίες διαβάζονται ακριβώς όπως εμφανίζονται στο αρχείο.', counting: ROWS_EL },
  rest_api: { timezone: 'Οι ημερομηνίες διαβάζονται ακριβώς όπως τις επιστρέφει το API.', counting: ROWS_EL },
  webhook_ingest: {
    timezone: 'Οι ημερομηνίες είναι αυτές που έφερε κάθε γραμμή που στάλθηκε.',
    counting: 'Οι γραμμές που στάλθηκαν με την ίδια ημερομηνία αθροίζονται.',
  },
};
for (const slug of ['make', 'n8n', 'zapier', 'pluga']) DATA_NOTES_EL[slug] = DATA_NOTES_EL.webhook_ingest;

/** The sentences for a platform in `locale`, in a fixed order; the generic sentence alone for anything else. */
export function dataNote(slug: string, _config?: Record<string, unknown> | null, locale: 'en' | 'el' = 'en'): string[] {
  const n = (locale === 'el' ? DATA_NOTES_EL[slug] : undefined) ?? DATA_NOTES[slug];
  if (!n) return [locale === 'el' ? GENERIC_DATA_NOTE_EL : GENERIC_DATA_NOTE];
  return [n.attribution, n.timezone, n.delay, n.sampling, n.counting].filter((s): s is string => !!s);
}
