import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  color?: "green" | "red" | "yellow" | "gray" | "blue";
}

const palette: Record<string, string> = {
  green: "bg-green-50 border-green-200 text-green-700",
  red:   "bg-red-50 border-red-200 text-red-700",
  yellow:"bg-yellow-50 border-yellow-200 text-yellow-700",
  gray:  "bg-gray-50 border-gray-200 text-gray-600",
  blue:  "bg-blue-50 border-blue-200 text-blue-700",
};

export function StatCard({ label, value, color = "gray" }: StatCardProps) {
  return (
    <div className={cn("rounded-xl border p-5", palette[color])}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
    </div>
  );
}
