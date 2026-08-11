import { RESOURCE_KINDS } from "../../drizzle/schema";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { storagePut } from "../storage";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Standalone shared library: user-defined folders holding either uploaded files
 * or external links (Drive, Docs, reference URLs).
 */
export const resourcesRouter = router({
  folders: protectedProcedure.query(() => db.getResourceFolders()),

  createFolder: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(({ input, ctx }) =>
      db.createResourceFolder({
        name: input.name.trim(),
        description: input.description ?? null,
        createdById: ctx.user.id,
      })
    ),

  updateFolder: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.updateResourceFolder(id, rest);
      return { success: true } as const;
    }),

  deleteFolder: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.deleteResourceFolder(input.id);
      return { success: true } as const;
    }),

  items: protectedProcedure
    .input(z.object({ folderId: z.number().int().optional() }).optional())
    .query(({ input }) => db.getResourceItems(input?.folderId)),

  /** Add an external link (Google Drive, Docs, any URL). */
  addLink: protectedProcedure
    .input(
      z.object({
        folderId: z.number().int(),
        title: z.string().min(1).max(255),
        linkUrl: z.string().url().max(2000),
        note: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(({ input, ctx }) =>
      db.createResourceItem({
        folderId: input.folderId,
        kind: "link",
        title: input.title.trim(),
        linkUrl: input.linkUrl.trim(),
        note: input.note ?? null,
        uploadedById: ctx.user.id,
      })
    ),

  /** Upload a file into a folder. Client sends base64 bytes. */
  addFile: protectedProcedure
    .input(
      z.object({
        folderId: z.number().int(),
        title: z.string().max(255).optional(),
        fileName: z.string().min(1).max(255),
        contentBase64: z.string().min(1),
        mimeType: z.string().max(128).optional(),
        note: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.contentBase64, "base64");
      if (buffer.length > MAX_UPLOAD_BYTES) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "檔案請小於 15MB" });
      }

      const safeName = input.fileName.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
      const key = `resources/${input.folderId}/${Date.now()}-${safeName}`;
      const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType);

      const id = await db.createResourceItem({
        folderId: input.folderId,
        kind: "file",
        title: (input.title?.trim() || input.fileName).slice(0, 255),
        fileKey: storedKey,
        fileUrl: url,
        fileName: input.fileName,
        mimeType: input.mimeType ?? null,
        fileSize: buffer.length,
        note: input.note ?? null,
        uploadedById: ctx.user.id,
      });
      return { id, url } as const;
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        title: z.string().min(1).max(255).optional(),
        note: z.string().max(500).nullable().optional(),
        linkUrl: z.string().url().max(2000).nullable().optional(),
        folderId: z.number().int().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.updateResourceItem(id, rest);
      return { success: true } as const;
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.deleteResourceItem(input.id);
      return { success: true } as const;
    }),

  kinds: protectedProcedure.query(() => RESOURCE_KINDS),
});

