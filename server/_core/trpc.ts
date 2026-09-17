import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { hasPermission, type Role, type Permission } from '../../shared/permissions';

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Re-check the account is still Active on every request, not just at login
  // time — a session cookie can outlive an Administrator suspending/
  // deactivating the account. Frontend menu hiding alone is not enough.
  if (ctx.user.status && ctx.user.status !== "active") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Your session has expired. Please log in again." });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.status !== 'active') {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Your session has expired. Please log in again." });
    }
    if (ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Creates a procedure that requires a specific permission.
 * Usage: const myProc = requirePermission("data.delete");
 */
export function requirePermission(permission: Permission) {
  return t.procedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;

      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      }

      if (ctx.user.status !== 'active') {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Your session has expired. Please log in again." });
      }

      if (!hasPermission(ctx.user.role as Role, permission)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Permission denied: ${permission}`,
        });
      }

      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
        },
      });
    })
  );
}
