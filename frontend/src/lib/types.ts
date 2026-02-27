export type User = {
  id: string;
  email: string;
  name: string;
  career?: string | null;
  university?: string | null;
  timezone: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  darkModePref?: boolean;
  themePreset?: "ocean" | "forest" | "sunset" | "midnight" | "sepia" | "violet";
  browserPushEnabled?: boolean;
};

export type Course = {
  id: string;
  name: string;
  code: string;
  teacher?: string | null;
  credits?: number | null;
  color?: string | null;
  semester?: string | null;
  classSessions?: ClassSession[];
};

export type ClassSession = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  modality: "PRESENTIAL" | "ONLINE";
  courseId: string;
};

export type Assignment = {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  estimatedMinutes?: number | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "IN_PROGRESS" | "DONE";
  repeatRule: "NONE" | "WEEKLY" | "MONTHLY";
  attachmentLinks: string[];
  tags: string[];
  courseId?: string | null;
  course?: Pick<Course, "id" | "name" | "code" | "color"> | null;
};

export type Exam = {
  id: string;
  title: string;
  dateTime: string;
  type: "QUIZ" | "MIDTERM" | "FINAL" | "OTHER";
  location?: string | null;
  syllabus?: string | null;
  weight?: number | null;
  reminderOffsets: number[];
  courseId?: string | null;
  course?: Pick<Course, "id" | "name" | "code" | "color"> | null;
};

export type Milestone = {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  completed: boolean;
};

export type ProjectTask = {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  status: "TODO" | "DOING" | "DONE";
};

export type Project = {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  status: "TODO" | "DOING" | "DONE";
  courseId?: string | null;
  course?: Pick<Course, "id" | "name" | "code" | "color"> | null;
  milestones: Milestone[];
  tasks: ProjectTask[];
};

export type Grade = {
  id: string;
  courseId: string;
  name: string;
  score: number;
  maxScore: number;
  weight: number;
  course?: Pick<Course, "name" | "code">;
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  type: "EXAM" | "ASSIGNMENT" | "MILESTONE" | "SYSTEM";
  read: boolean;
  createdAt: string;
};

export type DashboardSummary = {
  kpis: {
    pendingAssignments: number;
    upcomingExamsCount: number;
    unreadNotifications: number;
    riskCoursesCount: number;
  };
  upcomingExams: Exam[];
  riskCourses: Array<{
    courseId: string;
    courseName: string;
    currentAverage: number;
    projectedFinal: number;
    coveredWeight: number;
  }>;
  focusTasks: Assignment[];
};

export type SemesterHistoryCourse = {
  id: string;
  name: string;
  code: string;
  finalAverage: number | null;
  coveredWeight: number;
  gradesCount: number;
  archivedAt: string | null;
};

export type SemesterHistoryBucket = {
  semester: string;
  archivedAt: string;
  gpa: number | null;
  courseCount: number;
  gradedCourses: number;
  courses: SemesterHistoryCourse[];
};

export type SemesterHistoryResponse = {
  semesters: SemesterHistoryBucket[];
  cumulative: Array<{
    semester: string;
    gpa: number | null;
    cumulativeGpa: number | null;
  }>;
};

export type StudySession = {
  id: string;
  courseId: string;
  duration: number;
  startTime: string;
  endTime: string;
  source: "manual" | "pomodoro";
  course: Pick<Course, "id" | "name" | "code" | "color">;
};

export type StudyWeekSummary = {
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  byCourse: Array<{
    courseId: string;
    courseName: string;
    code: string;
    color: string | null;
    totalMinutes: number;
    sessionCount: number;
  }>;
  sessions: StudySession[];
};

export type StudyGoalProgress = {
  courseId: string;
  courseName: string;
  code: string;
  color: string | null;
  weeklyMinutes: number;
  completedMinutes: number;
  percentage: number;
  sessions: number;
};

export type CoachHint = {
  id: string;
  tone: "danger" | "warning" | "success";
  title: string;
  message: string;
  action: {
    label: string;
    href: string;
  };
};

export type TodayClassSession = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  modality: "PRESENTIAL" | "ONLINE";
  course: Pick<Course, "id" | "name" | "code" | "color">;
};

export type TodayActionItem = {
  id: string;
  type: "assignment" | "exam" | "project" | "milestone";
  title: string;
  dueAt: string;
  courseId: string | null;
  courseName: string | null;
  status: string | null;
  estimatedMinutes: number | null;
  bucket: "today" | "tomorrow" | "week";
  daysLeft: number;
};

export type TodayResponse = {
  date: string;
  classSessions: TodayClassSession[];
  prioritized: TodayActionItem[];
  dueToday: TodayActionItem[];
  dueTomorrow: TodayActionItem[];
  dueThisWeek: TodayActionItem[];
  studyMinutesToday: number;
  completedToday: number;
  totalDueToday: number;
  examsTomorrow: number;
  todayWorkloadMinutes: number;
  todayWorkloadItems: Array<{
    id: string;
    title: string;
    courseName: string | null;
    minutes: number;
  }>;
  dateBoundaries: {
    todayStart: string;
    todayEnd: string;
    tomorrowStart: string;
    tomorrowEnd: string;
  };
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  type: "class" | "assignment" | "exam" | "milestone";
  color?: string;
};

export type WeeklyPlanResponse = {
  generatedAt: string;
  plan: Array<{
    date: string;
    sessions: Array<{
      itemId: string;
      title: string;
      courseName?: string;
      minutes: number;
      type: "exam" | "assignment";
    }>;
  }>;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: PaginationMeta;
  sort?: {
    sortBy: string;
    sortDir: "asc" | "desc";
  };
};

export type SearchItem = {
  id: string;
  entityType: "course" | "archived_course" | "assignment" | "exam" | "project" | "task" | "study_session";
  title: string;
  subtitle: string;
  updatedAt: string;
  eventDate?: string;
};

export type SearchResponse = {
  items: SearchItem[];
  counts: {
    courses: number;
    archivedCourses: number;
    assignments: number;
    exams: number;
    projects: number;
    tasks: number;
    studySessions: number;
    total: number;
  };
  pagination: PaginationMeta;
  sort: {
    sortBy: "title" | "updatedAt" | "eventDate";
    sortDir: "asc" | "desc";
  };
  filters: {
    q: string;
    type: "all" | "course" | "assignment" | "exam" | "project";
  };
};
