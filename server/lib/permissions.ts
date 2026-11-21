import type { Ctx } from "../rpc/procedure.ts";
import { AppError } from "../rpc/procedure.ts";
import type { User } from "../db/schema.ts";
import {
  ALL_PERMISSIONS,
  SECTION_LABELS,
  canEditSection,
  canViewSection,
  normalizePermissions,
} from "../../shared/constants.ts";
import type { Permissions, Section } from "../../shared/constants.ts";

type PermissionUser = Pick<User, "role" | "permissions">;

/** Effective permissions. Admins always have everything. */
export function getPermissions(user: PermissionUser): Permissions {
  if (user.role === "admin") return ALL_PERMISSIONS;
  return normalizePermissions(user.permissions);
}

export function canView(user: PermissionUser, section: Section): boolean {
  return canViewSection(getPermissions(user), section);
}

export function canEdit(user: PermissionUser, section: Section): boolean {
  return canEditSection(getPermissions(user), section);
}

/** Cost prices and stock value: finance viewers and people who manage inventory. */
export function canSeeCost(user: PermissionUser): boolean {
  return canView(user, "finance") || canEdit(user, "inventory");
}

export function requireAdmin(ctx: Ctx): User {
  if (ctx.user.role !== "admin") throw new AppError("FORBIDDEN", "Only admins can do this");
  return ctx.user;
}

function noAccess(sections: Section[]): AppError {
  return new AppError(
    "FORBIDDEN",
    `You don't have access to ${sections.map((s) => SECTION_LABELS[s]).join(" or ")}. Ask an admin.`,
  );
}

/** Requires at least view access to one of the given sections. */
export function requireView(ctx: Ctx, ...sections: Section[]): User {
  if (!sections.some((s) => canView(ctx.user, s))) throw noAccess(sections);
  return ctx.user;
}

/** Requires edit access to the section. */
export function requireEdit(ctx: Ctx, section: Section): User {
  if (!canEdit(ctx.user, section)) {
    if (canView(ctx.user, section)) {
      throw new AppError("FORBIDDEN", `You can view ${SECTION_LABELS[section]} but not change it. Ask an admin.`);
    }
    throw noAccess([section]);
  }
  return ctx.user;
}

/** Shipping orders and recording returns. */
export function requireShipAccess(ctx: Ctx): User {
  requireEdit(ctx, "orders");
  if (!getPermissions(ctx.user).canShipAndReturn) {
    throw new AppError("FORBIDDEN", "You don't have permission to ship orders or record returns. Ask an admin.");
  }
  return ctx.user;
}

/** Admin who re-entered their password in the last few minutes (Admin Mode). */
export function requireAdminMode(ctx: Ctx): User {
  requireAdmin(ctx);
  const until = ctx.session.elevatedUntil;
  if (!until || until < ctx.now.getTime()) {
    throw new AppError("FORBIDDEN", "Turn on Admin Mode to do this. It asks for your password again.");
  }
  return ctx.user;
}
