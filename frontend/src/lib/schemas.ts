import { z } from "zod";

export const ThemePresetSchema = z.enum(["ocean", "forest", "sunset", "midnight", "sepia", "violet"]);

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  career: z.string().nullable().optional(),
  university: z.string().nullable().optional(),
  timezone: z.string(),
  notifyInApp: z.boolean(),
  notifyEmail: z.boolean(),
  darkModePref: z.boolean().optional(),
  themePreset: ThemePresetSchema.optional(),
  browserPushEnabled: z.boolean().optional(),
});

export const AuthResponseSchema = z.object({
  user: UserSchema,
  accessToken: z.string().min(1),
});

export const SettingsPreferencesSchema = z.object({
  notifyInApp: z.boolean(),
  notifyEmail: z.boolean(),
  darkModePref: z.boolean(),
  themePreset: ThemePresetSchema,
  browserPushEnabled: z.boolean(),
});

const CourseRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  color: z.string().nullable().optional(),
});

const AssignmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  dueDate: z.string(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]),
  repeatRule: z.enum(["NONE", "WEEKLY", "MONTHLY"]),
  attachmentLinks: z.array(z.string()),
  tags: z.array(z.string()),
  courseId: z.string().nullable().optional(),
  course: CourseRefSchema.nullable().optional(),
});

const ExamSchema = z.object({
  id: z.string(),
  title: z.string(),
  dateTime: z.string(),
  type: z.enum(["QUIZ", "MIDTERM", "FINAL", "OTHER"]),
  location: z.string().nullable().optional(),
  syllabus: z.string().nullable().optional(),
  weight: z.number().nullable().optional(),
  reminderOffsets: z.array(z.number()),
  courseId: z.string().nullable().optional(),
  course: CourseRefSchema.nullable().optional(),
});

export const DashboardSummarySchema = z.object({
  kpis: z.object({
    pendingAssignments: z.number(),
    upcomingExamsCount: z.number(),
    unreadNotifications: z.number(),
    riskCoursesCount: z.number(),
  }),
  upcomingExams: z.array(ExamSchema),
  riskCourses: z.array(
    z.object({
      courseId: z.string(),
      courseName: z.string(),
      currentAverage: z.number(),
      projectedFinal: z.number(),
      coveredWeight: z.number(),
    }),
  ),
  focusTasks: z.array(AssignmentSchema),
});

export const SemesterHistoryResponseSchema = z.object({
  semesters: z.array(
    z.object({
      semester: z.string(),
      archivedAt: z.string(),
      gpa: z.number().nullable(),
      courseCount: z.number(),
      gradedCourses: z.number(),
      courses: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          code: z.string(),
          finalAverage: z.number().nullable(),
          coveredWeight: z.number(),
          gradesCount: z.number(),
          archivedAt: z.string().nullable(),
        }),
      ),
    }),
  ),
  cumulative: z.array(
    z.object({
      semester: z.string(),
      gpa: z.number().nullable(),
      cumulativeGpa: z.number().nullable(),
    }),
  ),
});
