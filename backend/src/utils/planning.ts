import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";

type UpcomingItem = {
  id: string;
  title: string;
  dueDate: Date;
  type: "exam" | "assignment";
  courseName?: string;
};

export type WeeklyPlanSession = {
  date: string;
  sessions: Array<{
    itemId: string;
    title: string;
    courseName?: string;
    minutes: number;
    type: "exam" | "assignment";
  }>;
};

export function generateWeeklyPlan(items: UpcomingItem[], now = new Date()): WeeklyPlanSession[] {
  const start = startOfDay(now);
  const end = addDays(start, 6);

  const byUrgency = [...items]
    .filter((item) => item.dueDate >= start && item.dueDate <= addDays(end, 1))
    .sort((a, b) => {
      const daysA = Math.max(1, differenceInCalendarDays(a.dueDate, start));
      const daysB = Math.max(1, differenceInCalendarDays(b.dueDate, start));
      const typeWeightA = a.type === "exam" ? 1.4 : 1;
      const typeWeightB = b.type === "exam" ? 1.4 : 1;
      return typeWeightB / daysB - typeWeightA / daysA;
    });

  const plan: WeeklyPlanSession[] = [];

  for (let day = 0; day < 7; day += 1) {
    const currentDay = addDays(start, day);
    const label = format(currentDay, "yyyy-MM-dd");
    plan.push({
      date: label,
      sessions: [],
    });
  }

  const slotsPerDay = 2;
  const minutesPerSlot = 50;
  let cursor = 0;

  for (const day of plan) {
    for (let slot = 0; slot < slotsPerDay; slot += 1) {
      if (byUrgency.length === 0) break;
      const item = byUrgency[cursor % byUrgency.length];
      day.sessions.push({
        itemId: item.id,
        title: item.title,
        courseName: item.courseName,
        minutes: minutesPerSlot,
        type: item.type,
      });
      cursor += 1;
    }
  }

  return plan;
}
