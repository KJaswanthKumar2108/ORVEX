/**
 * ORVEX Industrial Design System Tokens
 * Standardized color palettes, typography, spacing, and semantic component styles.
 */

export const THEME = {
  // Surface and container hierarchy
  surfaces: {
    app: "bg-[#070a12]",
    subtle: "bg-[#0a0f1b]",
    card: "bg-[#0d1424]",
    cardHover: "hover:bg-[#121b30]",
    elevated: "bg-[#141f38]",
    input: "bg-[#090e1a]",
    border: "border-slate-800/80",
    borderSubtle: "border-slate-800/40",
    borderHover: "hover:border-slate-700/80",
    borderFocus: "focus:border-emerald-500/80",
  },

  // Semantic text hierarchy
  typography: {
    pageTitle: "text-xl sm:text-2xl font-bold tracking-tight text-white font-sans",
    sectionTitle: "text-base sm:text-lg font-semibold tracking-tight text-white font-sans",
    cardTitle: "text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono",
    metricValue: "text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white",
    metricUnit: "text-xs font-mono text-slate-400 font-normal ml-1",
    metricSubtitle: "text-xs text-slate-400 font-sans mt-1",
    tableHeader: "text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono",
    tableCell: "text-xs text-slate-200 font-sans",
    monoCell: "text-xs text-slate-300 font-mono",
    label: "text-xs font-medium text-slate-300",
    description: "text-xs text-slate-400 leading-relaxed",
  },

  // Semantic industrial status badges
  status: {
    operational: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      dot: "bg-emerald-400",
      label: "Operational",
    },
    idle: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
      dot: "bg-amber-400",
      label: "Idle",
    },
    lowLoad: {
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      text: "text-orange-400",
      dot: "bg-orange-400",
      label: "Low Load",
    },
    stopped: {
      bg: "bg-slate-800/60",
      border: "border-slate-700/60",
      text: "text-slate-400",
      dot: "bg-slate-500",
      label: "Stopped",
    },
    fault: {
      bg: "bg-rose-500/10",
      border: "border-rose-500/30",
      text: "text-rose-400",
      dot: "bg-rose-400",
      label: "Fault",
    },
    // Machine Health Statuses (ISO Condition Monitoring)
    healthy: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      dot: "bg-emerald-400",
      label: "Healthy",
    },
    watch: {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      text: "text-yellow-400",
      dot: "bg-yellow-400",
      label: "Watch",
    },
    warning: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
      dot: "bg-amber-400",
      label: "Warning",
    },
    critical: {
      bg: "bg-rose-500/10",
      border: "border-rose-500/30",
      text: "text-rose-400",
      dot: "bg-rose-400",
      label: "Critical",
    },
    insufficientData: {
      bg: "bg-slate-800/40",
      border: "border-slate-700/40",
      text: "text-slate-400",
      dot: "bg-slate-600",
      label: "Insufficient Data",
    },
  },

  // Button styles
  buttons: {
    primary:
      "inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium tracking-wide shadow-sm hover:shadow transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950",
    secondary:
      "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 text-xs font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950",
    ghost:
      "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 text-xs font-medium transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950",
    danger:
      "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950",
  },
} as const;

