import { Badge } from "./UI";

export function StreakBadge({ days }: { days: number }) {
  return (
    <Badge tone={days >= 7 ? "success" : days >= 3 ? "warning" : "default"}>
      Racha: {days} dia(s)
    </Badge>
  );
}

