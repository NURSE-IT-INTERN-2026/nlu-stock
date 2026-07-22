// Page sizes by context. Reference these instead of scattering magic numbers.
//
// - DEFAULT: standard list/table (alerts, items-master, item-detail-history, report tabs,
//   items cursor, server paginate() default).
// - COMPACT: small widget tables (maintenance schedule, outstanding-loans groups).
// - DASHBOARD: home widget tables with limited vertical space (recent-receive, recent-dispense).
export const PAGE_SIZE = {
  DEFAULT: 20,
  COMPACT: 10,
  DASHBOARD: 5,
} as const;
