import { Router } from "express";
import { z } from "zod";
import { requestSchema } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  createStudyGroup,
  getGroupCalendarForUser,
  inviteToStudyGroup,
  listStudyGroupMembersForUser,
  listStudyGroupsForUser,
  removeStudyGroupMember,
} from "../services/studyGroupsService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const createGroupSchema = requestSchema({
  body: z.object({
    name: z.string().min(2).max(120),
    courseId: z.string().optional().nullable(),
  }),
});

const inviteSchema = requestSchema({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    email: z.string().email(),
  }),
});

const groupCalendarSchema = requestSchema({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

const groupMembersSchema = requestSchema({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

const removeMemberSchema = requestSchema({
  params: z.object({
    id: z.coerce.number().int().positive(),
    userId: z.string().min(1),
  }),
});

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const groups = await listStudyGroupsForUser(req.user!.userId);
    res.json({ items: groups });
  }),
);

router.post(
  "/",
  validate(createGroupSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as { name: string; courseId?: string | null };
    const group = await createStudyGroup(req.user!.userId, payload);
    res.status(201).json(group);
  }),
);

router.post(
  "/:id/invite",
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const invite = await inviteToStudyGroup(req.user!.userId, Number(req.params.id), req.body.email);
    res.status(201).json(invite);
  }),
);

router.get(
  "/:id/calendar",
  validate(groupCalendarSchema),
  asyncHandler(async (req, res) => {
    const events = await getGroupCalendarForUser(req.user!.userId, Number(req.params.id));
    res.json({ events });
  }),
);

router.get(
  "/:id/members",
  validate(groupMembersSchema),
  asyncHandler(async (req, res) => {
    const members = await listStudyGroupMembersForUser(req.user!.userId, Number(req.params.id));
    res.json({ items: members });
  }),
);

router.delete(
  "/:id/members/:userId",
  validate(removeMemberSchema),
  asyncHandler(async (req, res) => {
    await removeStudyGroupMember(req.user!.userId, Number(req.params.id), req.params.userId);
    res.status(204).send();
  }),
);

export { router as groupsRoutes };
