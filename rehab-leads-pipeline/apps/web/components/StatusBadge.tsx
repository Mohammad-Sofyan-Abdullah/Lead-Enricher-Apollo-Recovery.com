type StatusType =
  | "valid"
  | "skipped"
  | "no_website"
  | "enriched"
  | "not_found"
  | "pending";

const config: Record<StatusType, { label: string; classes: string }> = {
  valid:     { label: "Valid",      classes: "bg-green-100 text-green-800"  },
  skipped:   { label: "Skipped",    classes: "bg-red-100 text-red-800"      },
  no_website:{ label: "No Website", classes: "bg-yellow-100 text-yellow-800"},
  enriched:  { label: "Enriched",   classes: "bg-green-100 text-green-800"  },
  not_found: { label: "Not Found",  classes: "bg-gray-100 text-gray-700"    },
  pending:   { label: "Pending",    classes: "bg-blue-100 text-blue-700"    },
};

export function StatusBadge({ status }: { status: StatusType }) {
  const { label, classes } = config[status] ?? config.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  );
}
