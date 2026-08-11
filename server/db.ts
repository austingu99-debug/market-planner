import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import {
  aiMessages,
  appSettings,
  editions,
  resourceFolders,
  resourceItems,
  taskAttachments,
  tasks,
  TASK_CATEGORIES,
  AI_PERSONAS,
  type AiPersona,
  type ResourceKind,
  type TaskCategory,
  type TaskStatus,
} from "../drizzle/schema";
import { ENV } from './_core/env';

export type TaskWithAssignee = {
  id: number;
  editionId: number | null;
  title: string;
  description: string | null;
  category: TaskCategory;
  customCategory: string | null;
  notes: string | null;
  cloudLink: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  dueDate: Date | null;
  status: TaskStatus;
  completedAt: Date | null;
  completedById: number | null;
  completedByName: string | null;
  createdById: number;
  createdByName: string | null;
  sortOrder: number;
  attachmentCount: number;
  createdAt: Date;
  updatedAt: Date;
};

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ===== Task Queries =====

// ===== Editions =====

export type EditionWithStats = {
  id: number;
  name: string | null;
  ordinal: number;
  eventDate: Date | null;
  note: string | null;
  isActive: boolean;
  taskCount: number;
  doneCount: number;
  createdAt: Date;
};

/** Display name: falls back to 第 N 屆 while the team has not named it yet. */
export function editionDisplayName(name: string | null, ordinal: number): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `第 ${ordinal} 屆`;
}

export async function getEditions(): Promise<EditionWithStats[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(editions).orderBy(asc(editions.ordinal));
  const allTasks = await db.select({ editionId: tasks.editionId, status: tasks.status }).from(tasks);

  return rows.map(e => {
    const own = allTasks.filter(t => t.editionId === e.id);
    return {
      id: e.id,
      name: e.name ?? null,
      ordinal: e.ordinal,
      eventDate: e.eventDate ?? null,
      note: e.note ?? null,
      isActive: e.isActive,
      taskCount: own.length,
      doneCount: own.filter(t => t.status === "done").length,
      createdAt: e.createdAt,
    };
  });
}

/** The edition currently in focus. Falls back to the lowest ordinal. */
export async function getActiveEdition() {
  const db = await getDb();
  if (!db) return null;

  const active = await db.select().from(editions).where(eq(editions.isActive, true)).limit(1);
  if (active.length > 0) return active[0];

  const first = await db.select().from(editions).orderBy(asc(editions.ordinal)).limit(1);
  return first.length > 0 ? first[0] : null;
}

export async function createEdition(data: {
  name?: string | null;
  eventDate?: Date | null;
  note?: string | null;
  createdById?: number | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select({ ordinal: editions.ordinal }).from(editions);
  const nextOrdinal = existing.reduce((max, e) => Math.max(max, e.ordinal), 0) + 1;
  const isFirst = existing.length === 0;

  const result = await db.insert(editions).values({
    name: data.name?.trim() ? data.name.trim() : null,
    ordinal: nextOrdinal,
    eventDate: data.eventDate ?? null,
    note: data.note ?? null,
    isActive: isFirst,
    createdById: data.createdById ?? null,
  });

  return result[0].insertId;
}

export async function updateEdition(id: number, data: {
  name?: string | null;
  eventDate?: Date | null;
  note?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name?.trim() ? data.name.trim() : null;
  if (data.eventDate !== undefined) updateData.eventDate = data.eventDate;
  if (data.note !== undefined) updateData.note = data.note;

  if (Object.keys(updateData).length > 0) {
    await db.update(editions).set(updateData).where(eq(editions.id, id));
  }
}

export async function setActiveEdition(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(editions).set({ isActive: false }).where(eq(editions.isActive, true));
  await db.update(editions).set({ isActive: true }).where(eq(editions.id, id));
}

export async function deleteEdition(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const own = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.editionId, id));
  for (const t of own) {
    await db.delete(taskAttachments).where(eq(taskAttachments.taskId, t.id));
  }
  await db.delete(tasks).where(eq(tasks.editionId, id));
  await db.delete(editions).where(eq(editions.id, id));

  const remaining = await db.select().from(editions).orderBy(asc(editions.ordinal)).limit(1);
  if (remaining.length > 0) {
    await setActiveEdition(remaining[0].id);
  }
}

/**
 * Copy the task skeleton of one edition into another: titles, descriptions,
 * categories and assignees carry over, while statuses reset to pending and
 * due dates are cleared (each edition sets its own calendar).
 */
export async function duplicateEditionTasks(params: {
  sourceEditionId: number;
  targetEditionId: number;
  categories?: TaskCategory[];
  keepAssignees?: boolean;
  createdById: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const source = await db.select().from(tasks).where(eq(tasks.editionId, params.sourceEditionId));
  const filtered = params.categories?.length
    ? source.filter(t => params.categories!.includes(t.category))
    : source;

  if (filtered.length === 0) return 0;

  await db.insert(tasks).values(
    filtered.map(t => ({
      editionId: params.targetEditionId,
      title: t.title,
      description: t.description ?? null,
      category: t.category,
      customCategory: t.customCategory ?? null,
      notes: null,
      cloudLink: t.cloudLink ?? null,
      assigneeId: params.keepAssignees ? t.assigneeId ?? null : null,
      dueDate: null,
      status: "pending" as TaskStatus,
      createdById: params.createdById,
      sortOrder: t.sortOrder,
    }))
  );

  return filtered.length;
}

function editionFilter(editionId?: number | null) {
  if (editionId === undefined) return undefined;
  return editionId === null ? isNull(tasks.editionId) : eq(tasks.editionId, editionId);
}

export async function getAllTasks(editionId?: number): Promise<TaskWithAssignee[]> {
  const db = await getDb();
  if (!db) return [];

  const where = editionFilter(editionId);
  const allTasks = where
    ? await db.select().from(tasks).where(where).orderBy(tasks.sortOrder, tasks.createdAt)
    : await db.select().from(tasks).orderBy(tasks.sortOrder, tasks.createdAt);
  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map(u => [u.id, u.name ?? null]));
  const counts = await getAttachmentCounts();

  return allTasks.map(t => ({
    id: t.id,
    editionId: t.editionId ?? null,
    title: t.title,
    description: t.description,
    category: t.category,
    customCategory: t.customCategory ?? null,
    notes: t.notes ?? null,
    cloudLink: t.cloudLink ?? null,
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeId ? userMap.get(t.assigneeId) ?? null : null,
    dueDate: t.dueDate ?? null,
    status: t.status,
    completedAt: t.completedAt ?? null,
    completedById: t.completedById ?? null,
    completedByName: t.completedById ? userMap.get(t.completedById) ?? null : null,
    createdById: t.createdById,
    createdByName: userMap.get(t.createdById) ?? null,
    sortOrder: t.sortOrder,
    attachmentCount: counts.get(t.id) ?? 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}

export async function getTasksByAssignee(userId: number, editionId?: number): Promise<TaskWithAssignee[]> {
  const db = await getDb();
  if (!db) return [];

  const scope = editionFilter(editionId);
  const userTasks = await db
    .select()
    .from(tasks)
    .where(scope ? and(eq(tasks.assigneeId, userId), scope) : eq(tasks.assigneeId, userId))
    .orderBy(tasks.sortOrder, tasks.createdAt);
  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map(u => [u.id, u.name ?? null]));
  const counts = await getAttachmentCounts();

  return userTasks.map(t => ({
    id: t.id,
    editionId: t.editionId ?? null,
    title: t.title,
    description: t.description,
    category: t.category,
    customCategory: t.customCategory ?? null,
    notes: t.notes ?? null,
    cloudLink: t.cloudLink ?? null,
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeId ? userMap.get(t.assigneeId) ?? null : null,
    dueDate: t.dueDate ?? null,
    status: t.status,
    completedAt: t.completedAt ?? null,
    completedById: t.completedById ?? null,
    completedByName: t.completedById ? userMap.get(t.completedById) ?? null : null,
    createdById: t.createdById,
    createdByName: userMap.get(t.createdById) ?? null,
    sortOrder: t.sortOrder,
    attachmentCount: counts.get(t.id) ?? 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}

export async function createTask(data: {
  title: string;
  editionId?: number | null;
  description?: string;
  category: TaskCategory;
  customCategory?: string | null;
  notes?: string | null;
  cloudLink?: string | null;
  assigneeId?: number | null;
  dueDate?: Date | null;
  status?: TaskStatus;
  createdById: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(tasks).values({
    title: data.title,
    editionId: data.editionId ?? null,
    description: data.description ?? null,
    category: data.category,
    customCategory: data.customCategory ?? null,
    notes: data.notes ?? null,
    cloudLink: data.cloudLink ?? null,
    assigneeId: data.assigneeId ?? null,
    dueDate: data.dueDate ?? null,
    status: data.status ?? "pending",
    createdById: data.createdById,
  });

  return result[0].insertId;
}

export async function updateTask(id: number, data: {
  title?: string;
  editionId?: number | null;
  description?: string | null;
  category?: TaskCategory;
  customCategory?: string | null;
  notes?: string | null;
  cloudLink?: string | null;
  assigneeId?: number | null;
  dueDate?: Date | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.editionId !== undefined) updateData.editionId = data.editionId;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.customCategory !== undefined) updateData.customCategory = data.customCategory;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.cloudLink !== undefined) updateData.cloudLink = data.cloudLink;
  if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;

  if (Object.keys(updateData).length > 0) {
    await db.update(tasks).set(updateData).where(eq(tasks.id, id));
  }
}

/**
 * Cycle a task through the three stages: pending → in_progress → done → pending.
 * Single tap on mobile advances the status.
 */
export async function cycleTaskStatus(id: number, userId: number): Promise<TaskStatus> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const current = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (current.length === 0) throw new Error("Task not found");

  const order: TaskStatus[] = ["pending", "in_progress", "done"];
  const currentIndex = order.indexOf(current[0].status);
  const next = order[(currentIndex + 1) % order.length];

  await db.update(tasks).set({
    status: next,
    completedAt: next === "done" ? new Date() : null,
    completedById: next === "done" ? userId : null,
  }).where(eq(tasks.id, id));

  return next;
}

/** Set a task to an explicit status (used by the status picker). */
export async function setTaskStatus(id: number, status: TaskStatus, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(tasks).set({
    status,
    completedAt: status === "done" ? new Date() : null,
    completedById: status === "done" ? userId : null,
  }).where(eq(tasks.id, id));
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(taskAttachments).where(eq(taskAttachments.taskId, id));
  await db.delete(tasks).where(eq(tasks.id, id));
}

// ===== Task Attachments =====

async function getAttachmentCounts(): Promise<Map<number, number>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db.select({ taskId: taskAttachments.taskId }).from(taskAttachments);
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.taskId, (map.get(r.taskId) ?? 0) + 1);
  return map;
}

export type TaskAttachmentWithUploader = {
  id: number;
  taskId: number;
  fileName: string;
  url: string;
  mimeType: string | null;
  fileSize: number | null;
  uploadedById: number;
  uploadedByName: string | null;
  createdAt: Date;
};

export async function getTaskAttachments(taskId: number): Promise<TaskAttachmentWithUploader[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(taskAttachments)
    .where(eq(taskAttachments.taskId, taskId))
    .orderBy(taskAttachments.createdAt);
  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map(u => [u.id, u.name ?? null]));

  return rows.map(a => ({
    id: a.id,
    taskId: a.taskId,
    fileName: a.fileName,
    url: a.url,
    mimeType: a.mimeType ?? null,
    fileSize: a.fileSize ?? null,
    uploadedById: a.uploadedById,
    uploadedByName: userMap.get(a.uploadedById) ?? null,
    createdAt: a.createdAt,
  }));
}

export async function addTaskAttachment(data: {
  taskId: number;
  fileName: string;
  fileKey: string;
  url: string;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedById: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(taskAttachments).values({
    taskId: data.taskId,
    fileName: data.fileName,
    fileKey: data.fileKey,
    url: data.url,
    mimeType: data.mimeType ?? null,
    fileSize: data.fileSize ?? null,
    uploadedById: data.uploadedById,
  });
  return result[0].insertId;
}

export async function deleteTaskAttachment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(taskAttachments).where(eq(taskAttachments.id, id));
}

export async function getTaskStats(editionId?: number): Promise<{
  byCategory: Record<string, { total: number; done: number; inProgress: number; pending: number; percentage: number }>;
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  percentage: number;
}> {
  const db = await getDb();
  if (!db) return { byCategory: {}, total: 0, done: 0, inProgress: 0, pending: 0, percentage: 0 };

  const where = editionFilter(editionId);
  const allTasks = where
    ? await db.select().from(tasks).where(where)
    : await db.select().from(tasks);
  const byCategory: Record<string, { total: number; done: number; inProgress: number; pending: number; percentage: number }> = {};

  for (const cat of TASK_CATEGORIES) {
    const catTasks = allTasks.filter(t => t.category === cat);
    const total = catTasks.length;
    const done = catTasks.filter(t => t.status === "done").length;
    const inProgress = catTasks.filter(t => t.status === "in_progress").length;
    const pending = catTasks.filter(t => t.status === "pending").length;
    byCategory[cat] = {
      total,
      done,
      inProgress,
      pending,
      percentage: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }

  const total = allTasks.length;
  const done = allTasks.filter(t => t.status === "done").length;
  const inProgress = allTasks.filter(t => t.status === "in_progress").length;
  const pending = allTasks.filter(t => t.status === "pending").length;

  return {
    byCategory,
    total,
    done,
    inProgress,
    pending,
    percentage: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

// ===== App Settings =====

export async function getAppSettings() {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateAppSettings(data: {
  marketEventDate?: Date | null;
  marketEventName?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = {};
  if (data.marketEventDate !== undefined) updateData.marketEventDate = data.marketEventDate;
  if (data.marketEventName !== undefined) updateData.marketEventName = data.marketEventName;

  if (Object.keys(updateData).length > 0) {
    await db.update(appSettings).set(updateData).where(eq(appSettings.id, 1));
  }
}

// ===== Team Members =====

/**
 * Maximum roster size. The team is a fixed four-person crew, so at most the
 * first four accounts that sign in become assignable members. Anyone signing in
 * afterwards can still browse, but cannot be picked as an assignee.
 */
export const MAX_TEAM_MEMBERS = 4;

export async function getTeamMembers() {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
  })
    .from(users)
    .orderBy(users.id)
    .limit(MAX_TEAM_MEMBERS);

  return result;
}

/** True when the given user id belongs to the fixed four-person roster. */
export async function isRosterMember(userId: number): Promise<boolean> {
  const roster = await getTeamMembers();
  return roster.some(m => m.id === userId);
}

// ===== AI Consultation =====

export type AiMessageWithAuthor = {
  id: number;
  persona: AiPersona;
  role: "user" | "assistant";
  content: string;
  authorId: number | null;
  authorName: string | null;
  createdAt: Date;
};

export async function getAiMessages(
  persona?: AiPersona,
  limit = 200
): Promise<AiMessageWithAuthor[]> {
  const db = await getDb();
  if (!db) return [];

  const query = db
    .select()
    .from(aiMessages)
    .orderBy(aiMessages.id)
    .limit(limit);

  const rows = persona
    ? await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.persona, persona))
        .orderBy(aiMessages.id)
        .limit(limit)
    : await query;

  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map(u => [u.id, u.name ?? null]));

  return rows.map(r => ({
    id: r.id,
    persona: (r.persona as AiPersona) ?? "curation",
    role: r.role,
    content: r.content,
    authorId: r.authorId,
    authorName: r.authorId ? userMap.get(r.authorId) ?? null : null,
    createdAt: r.createdAt,
  }));
}

export async function addAiMessage(data: {
  persona?: AiPersona;
  role: "user" | "assistant";
  content: string;
  authorId?: number | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(aiMessages).values({
    persona: data.persona ?? "curation",
    role: data.role,
    content: data.content,
    authorId: data.authorId ?? null,
  });
  return result[0].insertId;
}

export async function clearAiMessages(persona?: AiPersona): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (persona) {
    await db.delete(aiMessages).where(eq(aiMessages.persona, persona));
  } else {
    await db.delete(aiMessages);
  }
}

// ===== Resource Library (檔案與資源) =====

export type ResourceFolderWithCount = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  itemCount: number;
  createdById: number;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getResourceFolders(): Promise<ResourceFolderWithCount[]> {
  const db = await getDb();
  if (!db) return [];

  const folders = await db
    .select()
    .from(resourceFolders)
    .orderBy(resourceFolders.sortOrder, resourceFolders.createdAt);
  const itemRows = await db.select({ folderId: resourceItems.folderId }).from(resourceItems);
  const counts = new Map<number, number>();
  for (const r of itemRows) counts.set(r.folderId, (counts.get(r.folderId) ?? 0) + 1);

  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map(u => [u.id, u.name ?? null]));

  return folders.map(f => ({
    id: f.id,
    name: f.name,
    description: f.description ?? null,
    sortOrder: f.sortOrder,
    itemCount: counts.get(f.id) ?? 0,
    createdById: f.createdById,
    createdByName: userMap.get(f.createdById) ?? null,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
}

export async function createResourceFolder(data: {
  name: string;
  description?: string | null;
  createdById: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select({ sortOrder: resourceFolders.sortOrder }).from(resourceFolders);
  const nextOrder = existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;

  const result = await db.insert(resourceFolders).values({
    name: data.name,
    description: data.description ?? null,
    sortOrder: nextOrder,
    createdById: data.createdById,
  });
  return result[0].insertId;
}

export async function updateResourceFolder(
  id: number,
  data: { name?: string; description?: string | null }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (Object.keys(updateData).length > 0) {
    await db.update(resourceFolders).set(updateData).where(eq(resourceFolders.id, id));
  }
}

/** Deleting a folder also drops its items (file bytes become unreachable). */
export async function deleteResourceFolder(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(resourceItems).where(eq(resourceItems.folderId, id));
  await db.delete(resourceFolders).where(eq(resourceFolders.id, id));
}

export type ResourceItemWithUploader = {
  id: number;
  folderId: number;
  kind: ResourceKind;
  title: string;
  note: string | null;
  linkUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  uploadedById: number;
  uploadedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getResourceItems(folderId?: number): Promise<ResourceItemWithUploader[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = folderId
    ? await db.select().from(resourceItems).where(eq(resourceItems.folderId, folderId)).orderBy(resourceItems.createdAt)
    : await db.select().from(resourceItems).orderBy(resourceItems.createdAt);

  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map(u => [u.id, u.name ?? null]));

  return rows.map(r => ({
    id: r.id,
    folderId: r.folderId,
    kind: r.kind,
    title: r.title,
    note: r.note ?? null,
    linkUrl: r.linkUrl ?? null,
    fileUrl: r.fileUrl ?? null,
    fileName: r.fileName ?? null,
    mimeType: r.mimeType ?? null,
    fileSize: r.fileSize ?? null,
    uploadedById: r.uploadedById,
    uploadedByName: userMap.get(r.uploadedById) ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function createResourceItem(data: {
  folderId: number;
  kind: ResourceKind;
  title: string;
  note?: string | null;
  linkUrl?: string | null;
  fileKey?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedById: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(resourceItems).values({
    folderId: data.folderId,
    kind: data.kind,
    title: data.title,
    note: data.note ?? null,
    linkUrl: data.linkUrl ?? null,
    fileKey: data.fileKey ?? null,
    fileUrl: data.fileUrl ?? null,
    fileName: data.fileName ?? null,
    mimeType: data.mimeType ?? null,
    fileSize: data.fileSize ?? null,
    uploadedById: data.uploadedById,
  });
  return result[0].insertId;
}

export async function updateResourceItem(
  id: number,
  data: { title?: string; note?: string | null; linkUrl?: string | null; folderId?: number }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.note !== undefined) updateData.note = data.note;
  if (data.linkUrl !== undefined) updateData.linkUrl = data.linkUrl;
  if (data.folderId !== undefined) updateData.folderId = data.folderId;
  if (Object.keys(updateData).length > 0) {
    await db.update(resourceItems).set(updateData).where(eq(resourceItems.id, id));
  }
}

export async function deleteResourceItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(resourceItems).where(eq(resourceItems.id, id));
}
