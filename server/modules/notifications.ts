import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { notifications, users } from "../db/schema.ts";
import { userName } from "../lib/items.ts";
import { AppError, mutation, noInput, query, zId } from "../rpc/procedure.ts";

const LIST_LIMIT = 50;
// Badge shows "99+" past this
const UNREAD_COUNT_CAP = 100;

export const notificationsRouter = {
  list: query({
    input: noInput,
    handler: (ctx) =>
      ctx.db
        .select({ n: notifications, actor: users })
        .from(notifications)
        .leftJoin(users, eq(users._id, notifications.actorId))
        .where(eq(notifications.userId, ctx.user._id))
        .orderBy(desc(notifications._creationTime))
        .limit(LIST_LIMIT)
        .all()
        .map(({ n, actor }) => ({
          ...n,
          actorName: actor ? userName(actor) : null,
          byMe: n.actorId === ctx.user._id,
        })),
  }),

  unreadCount: query({
    input: noInput,
    handler: (ctx) => {
      const n =
        ctx.db
          .select({ n: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, ctx.user._id),
              eq(notifications.read, false),
            ),
          )
          .get()?.n ?? 0;
      return Math.min(n, UNREAD_COUNT_CAP);
    },
  }),

  markRead: mutation({
    input: z.object({ notificationId: zId }),
    handler: (ctx, args) => {
      const result = ctx.db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications._id, args.notificationId),
            eq(notifications.userId, ctx.user._id),
          ),
        )
        .run();
      if (result.changes === 0)
        throw new AppError("NOT_FOUND", "Notification not found");
      return null;
    },
  }),

  markAllRead: mutation({
    input: noInput,
    handler: (ctx) => {
      ctx.db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.userId, ctx.user._id),
            eq(notifications.read, false),
          ),
        )
        .run();
      return null;
    },
  }),
};
