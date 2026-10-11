/* =============================================================
   CONTENT — marketing copy for the pages that have no data behind
   them: the public landing page and the Premium plans.

   Everything else the app renders — the feed, communities,
   challenges, the library, ranking, badges — now comes from the API,
   so it is not duplicated here. If a value can be earned, saved or
   changed by a user, it lives in the database, not in this file.
   ============================================================= */

/* ---------- Landing page ---------- */
/* Every number below describes how the product is built, not how popular it
   is. Student counts, university counts and star ratings were invented copy
   for a platform that has none of them yet, and a page that opens with a
   fabricated statistic is a strange place to argue for auditable AI. What is
   here is checkable in the code: the screening pipeline in
   app/services/safety.py, the four-step order enforced in
   app/routers/analysis.py, the synthetic-only imaging engine, and the three
   locales in src/locales/. */
export const home = {
  eyebrow: "Guardrails, audit trails, and a human on the hook",
  headline: ["Use AI in medicine.", "Stay accountable for it."],
  subhead:
    "Medly trains clinicians to work with AI the way medicine will demand: commit to your own read first, see the model second, and leave a record of who decided what.",
  primaryCta: "Start training",
  secondaryCta: "Explore the platform",
  trustBadges: [
    "Every AI answer screened and logged",
    "No patient data, ever",
    "Synthetic imaging, clearly labelled",
  ],
  stats: [
    { value: "100%", label: "AI answers audited" },
    { value: "4 steps", label: "Enforced before the model is revealed" },
    { value: "0", label: "Patient records used" },
    { value: "3", label: "Languages supported" },
  ],
  featuresTitle: "Why this is not a chatbot with a stethoscope",
  featuresSubtitle:
    "Every AI feature here is wrapped in the controls a clinical setting would demand — and the platform teaches why each control exists.",
  features: [
    {
      icon: "shield",
      title: "Audited AI interactions",
      body: "Every question is screened, every answer carries its disclaimer, and both are written to an audit trail you can read.",
    },
    {
      icon: "scan",
      title: "Imaging that resists automation bias",
      body: "You commit to your own reading before the model runs. The order is enforced by the server, not by good intentions.",
    },
    {
      icon: "graduation",
      title: "A safety curriculum, assessed",
      body: "Courses and quizzes on automation bias, confidence thresholds and accountability — marked, not just read.",
    },
    {
      icon: "stethoscope",
      title: "Virtual patients on a deterministic engine",
      body: "Clinical outcomes come from an authored rules engine. The model only puts them into words.",
    },
  ],
  ctaTitle: "Learn AI the way you will have to use it",
  ctaBody:
    "Take a case: your reading first, the model second, and a record of both that a supervisor could audit.",
  ctaButton: "Start training",
} as const;

/* ---------- Premium ---------- */
export const premium = {
  title: "Upgrade to Premium",
  subtitle: "Unlock your full potential with advanced features and exclusive content",
  benefits: [
    { icon: "users", title: "Create Communities", body: "Start and run your own communities — the Premium-only feature" },
    { icon: "book", title: "Advanced Library", body: "Access premium books, videos, and exclusive study materials" },
    { icon: "brain", title: "AI Study Assistant", body: "Get personalized summaries, study plans, and recommendations" },
    { icon: "zap", title: "Exclusive Challenges", body: "Access premium-only challenges with bigger rewards" },
  ],
  plans: [
    { id: "monthly", name: "Monthly", blurb: "Perfect for trying out premium features", price: "$3.99", period: "/month", cta: "Choose Plan", popular: false },
    { id: "yearly", name: "Yearly", blurb: "Save 16% with annual billing", price: "$39.99", period: "/year", cta: "Get Started", popular: true },
  ],
  includedTitle: "Everything Included",
  included: [
    "Unlimited community access",
    "Create your own communities",
    "AI-powered study assistant",
    "Premium library content",
    "Exclusive challenges",
    "Advanced note-taking",
    "Priority support",
    "No ads",
  ],
};
