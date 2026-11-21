import { and, asc, count, eq, isNull, gt } from "drizzle-orm";
import { z } from "zod";
import { authTokens, users } from "../db/schema.ts";
import type { User } from "../db/schema.ts";
import { AppError, mutation, noInput, query, zId } from "../rpc/procedure.ts";
import { getPermissions, requireAdmin } from "../lib/permissions.ts";
import { createLinkToken, linkPath } from "../auth/tokens.ts";
import { deleteUserSessions } from "../auth/session.ts";
import {
  ACCESS_LEVELS,
  PERMISSION_PRESETS,
  ROLES,
  SECTIONS,
  normalizePermissions,
} from "../../shared/constants.ts";
import type { Permissions } from "../../shared/constants.ts";
import type { Ctx } from "../rpc/procedure.ts";

const zLevel = z.enum(ACCESS_LEVELS).optional();
const zPermissions = z.object({
  access: z.object(
    Object.fromEntries(SECTIONS.map((sct) => [sct, zLevel])) as Record<
      (typeof SECTIONS)[number],
      typeof zLevel
    >,
  ),
  canShipAndReturn: z.boolean(),
});

/** Cleans what the form sent (drops empty levels; shipping needs Orders: Edit). */
function memberPermissions(p: z.infer<typeof zPermissions>): Permissions {
  return normalizePermissions(p);
}

function getTarget(ctx: Ctx, userId: string): User {
  const target = ctx.db.select().from(users).where(eq(users._id, userId)).get();
  if (!target) throw new AppError("NOT_FOUND", "User not found");
  return target;
}

function activeAdminCount(ctx: Ctx): number {
  return (
    ctx.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
      .get()?.n ?? 0
  );
}

export const usersRouter = {
  /** Current user's effective section permissions (admins get everything). */
  myPermissions: query({
    input: noInput,
    handler: (ctx) => getPermissions(ctx.user),
  }),

  listTeam: query({
    input: noInput,
    handler: (ctx) => {
      requireAdmin(ctx);
      const pending = new Map(
        ctx.db
          .select()
          .from(authTokens)
          .where(
            and(
              isNull(authTokens.usedAt),
              gt(authTokens.expiresAt, ctx.now.getTime()),
            ),
          )
          .all()
          .map((t) => [t.userId, t]),
      );
      return ctx.db
        .select()
        .from(users)
        .orderBy(asc(users._creationTime))
        .all()
        .map((u) => ({
          _id: u._id,
          _creationTime: u._creationTime,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt,
          hasPassword: u.passwordHash !== null,
          pendingLinkKind: pending.get(u._id)?.kind ?? null,
          pendingLinkExpiresAt: pending.get(u._id)?.expiresAt ?? null,
          isSelf: u._id === ctx.user._id,
          effectivePermissions: getPermissions(u),
        }));
    },
  }),

  /** Adds a teammate and returns a one-time invite link to send them. */
  invite: mutation({
    input: z.object({
      name: z.string().trim().min(1, "Enter a name").max(100),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Enter a valid email address")
        .max(200),
      role: z.enum(ROLES),
      permissions: zPermissions,
    }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const existing = ctx.db
        .select()
        .from(users)
        .where(eq(users.email, args.email))
        .get();
      if (existing)
        throw new AppError("CONFLICT", `${args.email} is already on the team`);
      const user = ctx.db
        .insert(users)
        .values({
          name: args.name,
          email: args.email,
          role: args.role,
          permissions:
            args.role === "member" ? memberPermissions(args.permissions) : null,
        })
        .returning()
        .get();
      const { token, expiresAt } = createLinkToken(ctx.db, user._id, "invite");
      return { userId: user._id, path: linkPath("invite", token), expiresAt };
    },
  }),

  /** New one-time link: an invite for people who never signed in, otherwise a password reset. */
  createLink: mutation({
    input: z.object({ userId: zId }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const target = getTarget(ctx, args.userId);
      if (!target.isActive)
        throw new AppError("BAD_REQUEST", "Reactivate this teammate first");
      const kind: "reset" | "invite" = target.passwordHash ? "reset" : "invite";
      const { token, expiresAt } = createLinkToken(ctx.db, target._id, kind);
      return { path: linkPath(kind, token), kind, expiresAt };
    },
  }),

  setPermissions: mutation({
    input: z.object({ userId: zId, permissions: zPermissions }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const target = getTarget(ctx, args.userId);
      if (target.role === "admin")
        throw new AppError("BAD_REQUEST", "Admins always have full access");
      ctx.db
        .update(users)
        .set({ permissions: memberPermissions(args.permissions) })
        .where(eq(users._id, target._id))
        .run();
      return null;
    },
  }),

  setRole: mutation({
    input: z.object({ userId: zId, role: z.enum(ROLES) }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const target = getTarget(ctx, args.userId);
      if (target.role === args.role) return null;
      if (
        target.role === "admin" &&
        target.isActive &&
        activeAdminCount(ctx) <= 1
      ) {
        throw new AppError(
          "BAD_REQUEST",
          "You can't remove the last admin. Promote another teammate first.",
        );
      }
      // Demoted admins start with full section access; admins can narrow it after
      ctx.db
        .update(users)
        .set({
          role: args.role,
          permissions:
            args.role === "member"
              ? (target.permissions ??
                PERMISSION_PRESETS.warehouseLead.permissions)
              : target.permissions,
        })
        .where(eq(users._id, target._id))
        .run();
      return null;
    },
  }),

  /** Deactivated teammates are signed out and can't sign in until reactivated. */
  setActive: mutation({
    input: z.object({ userId: zId, isActive: z.boolean() }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const target = getTarget(ctx, args.userId);
      if (!args.isActive) {
        if (target._id === ctx.user._id)
          throw new AppError("BAD_REQUEST", "You can't deactivate yourself");
        if (
          target.role === "admin" &&
          target.isActive &&
          activeAdminCount(ctx) <= 1
        ) {
          throw new AppError(
            "BAD_REQUEST",
            "You can't deactivate the last admin",
          );
        }
        deleteUserSessions(ctx.db, target._id);
      }
      ctx.db
        .update(users)
        .set({ isActive: args.isActive })
        .where(eq(users._id, target._id))
        .run();
      return null;
    },
  }),

  /** Admins rename team members (the name shown on orders and WhatsApp posts). */
  setName: mutation({
    input: z.object({
      userId: zId,
      name: z.string().trim().min(1, "Enter a name").max(100),
    }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const result = ctx.db
        .update(users)
        .set({ name: args.name })
        .where(eq(users._id, args.userId))
        .run();
      if (result.changes === 0)
        throw new AppError("NOT_FOUND", "User not found");
      return null;
    },
  }),

  updateProfile: mutation({
    input: z.object({
      name: z.string().trim().min(1, "Enter your name").max(100),
    }),
    handler: (ctx, args) => {
      ctx.db
        .update(users)
        .set({ name: args.name })
        .where(eq(users._id, ctx.user._id))
        .run();
      return null;
    },
  }),
};
