import { NotificationType } from "@prisma/client";
import { z } from "zod";
import { requestSchema } from "../lib/validate";

export const listNotificationsSchema = requestSchema({
  query: z.object({
    unreadOnly: z.coerce.boolean().optional(),
    type: z.nativeEnum(NotificationType).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    sortBy: z.enum(["createdAt", "read", "type"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  }),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>["query"];
