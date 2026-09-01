// Enterprise Floating Card System — design tokens shared across every page.
// Usage: className={cardFloating(dark)}  — instead of re-typing border/shadow/hover classes per component.

export const cardFloating = (dark, extra = '') =>
  `${dark
    ? 'bg-navy-soft border border-slate-800 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30'
    : 'bg-white border border-slate-100 shadow-lg shadow-slate-200/60 hover:shadow-xl hover:shadow-slate-200/80'
  } rounded-2xl hover:-translate-y-1 transition-all duration-300 ${extra}`;

// Page background (Design Rule #6): soft slate, never pure white —
// makes the floating white cards read as elevated.
export const pageBg = (dark) => (dark ? 'bg-navy' : 'bg-slate-100');

// Skeleton loading block (Design Rule #10)
export const skeleton = (dark, extra = '') =>
  `animate-pulse rounded-md ${dark ? 'bg-slate-700/50' : 'bg-slate-200/70'} ${extra}`;
