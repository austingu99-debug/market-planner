import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * App-wide settings (single-row table, id=1).
 * Stores the market event date for the countdown display.
 */
export const appSettings = mysqlTable("app_settings", {
  id: int("id").primaryKey(),
  marketEventDate: timestamp("market_event_date"),
  marketEventName: varchar("market_event_name", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;

/**
 * Editions — the team runs the market repeatedly, so every preparation cycle
 * lives in its own edition. Name may be left blank on purpose (the team fills
 * later editions in when they are ready); the date is optional too.
 */
export const editions = mysqlTable("editions", {
  id: int("id").autoincrement().primaryKey(),
  /** e.g. 「咻一下市集 第一屆」. Nullable so later editions can stay unnamed. */
  name: varchar("name", { length: 160 }),
  /** Sequence number shown as 第 N 屆 when the name is blank. */
  ordinal: int("ordinal").notNull(),
  /** Market day. Left null until the team locks the date. */
  eventDate: timestamp("event_date"),
  /** Free-text venue / theme memo. */
  note: varchar("note", { length: 500 }),
  /** Only one edition is the current focus at a time. */
  isActive: boolean("is_active").default(false).notNull(),
  archivedAt: timestamp("archived_at"),
  createdById: int("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Edition = typeof editions.$inferSelect;
export type InsertEdition = typeof editions.$inferInsert;

/**
 * Task categories follow the team's actual working groups (from their existing
 * spreadsheet), plus a free-text "custom" slot.
 */
export const TASK_CATEGORIES = [
  "curation",   // 總策展與法律財務組
  "design",     // 美學與場域設計組
  "vendor",     // 招商與攤商關係組
  "marketing",  // 行銷與數位公關組
  "operation",  // 營運執行與物流組
  "other",      // 自訂（可自行輸入分類名稱）
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  curation: "總策展與法律財務",
  design: "美學與場域設計",
  vendor: "招商與攤商關係",
  marketing: "行銷與數位公關",
  operation: "營運執行與物流",
  other: "自訂",
};

/** Short labels for tight mobile rows. */
export const CATEGORY_SHORT_LABELS: Record<TaskCategory, string> = {
  curation: "總策展",
  design: "美學場域",
  vendor: "招商攤商",
  marketing: "行銷公關",
  operation: "營運物流",
  other: "自訂",
};

/**
 * Task status — three stages matching the reference design:
 * pending (待定) → in_progress (進行中) → done (已完成)
 */
export const TASK_STATUSES = ["pending", "in_progress", "done"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "待定",
  in_progress: "進行中",
  done: "已完成",
};

/**
 * Tasks table — each task belongs to one of six categories,
 * can be assigned to a user, has an optional due date,
 * and tracks a three-stage status.
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  /** Owning edition. Null only for legacy rows created before editions existed. */
  editionId: int("edition_id"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", [...TASK_CATEGORIES]).notNull(),
  /** Free-text label shown instead of "其他" when category === "other". */
  customCategory: varchar("custom_category", { length: 60 }),
  /** Long-form notes the team can keep appending to. */
  notes: text("notes"),
  /** External link (Google Drive / Docs / any reference URL). */
  cloudLink: text("cloud_link"),
  assigneeId: int("assignee_id"),
  dueDate: timestamp("due_date"),
  status: mysqlEnum("status", [...TASK_STATUSES]).default("pending").notNull(),
  completedAt: timestamp("completed_at"),
  completedById: int("completed_by_id"),
  createdById: int("created_by_id").notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Shared AI consultation log — every member sees the same conversation,
 * so answers benefit the whole team.
 */
export const aiMessages = mysqlTable("ai_messages", {
  id: int("id").autoincrement().primaryKey(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  authorId: int("author_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = typeof aiMessages.$inferInsert;

/**
 * Attachments hanging off a single task. File bytes live in S3; we only keep
 * the storage key plus display metadata here.
 */
export const taskAttachments = mysqlTable("task_attachments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("task_id").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileKey: varchar("file_key", { length: 512 }).notNull(),
  url: text("url").notNull(),
  mimeType: varchar("mime_type", { length: 128 }),
  fileSize: int("file_size"),
  uploadedById: int("uploaded_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type InsertTaskAttachment = typeof taskAttachments.$inferInsert;

/**
 * Standalone "檔案與資源" area. Folders are fully user-defined (name + optional
 * description) so the team can organise shared material however they like.
 */
export const resourceFolders = mysqlTable("resource_folders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }),
  sortOrder: int("sort_order").default(0).notNull(),
  createdById: int("created_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ResourceFolder = typeof resourceFolders.$inferSelect;
export type InsertResourceFolder = typeof resourceFolders.$inferInsert;

/** A resource item is either an uploaded file or an external link. */
export const RESOURCE_KINDS = ["file", "link"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const resourceItems = mysqlTable("resource_items", {
  id: int("id").autoincrement().primaryKey(),
  folderId: int("folder_id").notNull(),
  kind: mysqlEnum("kind", [...RESOURCE_KINDS]).notNull(),
  /** Display title. Falls back to file name / URL host when left blank. */
  title: varchar("title", { length: 255 }).notNull(),
  note: varchar("note", { length: 500 }),
  /** kind === "link" */
  linkUrl: text("link_url"),
  /** kind === "file" */
  fileKey: varchar("file_key", { length: 512 }),
  fileUrl: text("file_url"),
  fileName: varchar("file_name", { length: 255 }),
  mimeType: varchar("mime_type", { length: 128 }),
  fileSize: int("file_size"),
  uploadedById: int("uploaded_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ResourceItem = typeof resourceItems.$inferSelect;
export type InsertResourceItem = typeof resourceItems.$inferInsert;
