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
import { loadLocalDb, saveLocalDb, StoredTask, StoredEdition } from "./localStore";
import { OFFICIAL_TIMELINE_TASKS, OFFICIAL_RESOURCE_FOLDERS } from "./seedData";

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

const DEFAULT_DATABASE_URL =
  "mysql://31PBZEhPFXLyVbp.e2a108d9e1ae:7HLuq0091df4UYaLpALp@gateway06.us-east-1.prod.aws.tidbcloud.com:4000/Es4BvchFRGcgYYcUzKQNbt?ssl={\"rejectUnauthorized\":true}";

let _db: ReturnType<typeof drizzle> | null = null;
let _dbFailed = false;

// Lazily create the drizzle instance so local tooling can run with fallback.
export async function getDb() {
  if (_dbFailed) return null;
  const dbUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  if (!_db && dbUrl) {
    try {
      _db = drizzle(dbUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect, using local persistence:", error);
      _db = null;
      _dbFailed = true;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (db) {
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
      return;
    } catch (error) {
      console.warn("[Database] Remote upsert failed, fallback to local store:", error);
    }
  }

  // Local store fallback
  const ldb = loadLocalDb();
  const existing = ldb.users.find(u => u.openId === user.openId);
  const now = new Date().toISOString();
  if (existing) {
    if (user.name !== undefined) existing.name = user.name ? user.name.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim() : null;
    if (user.email !== undefined) existing.email = user.email ?? null;
    if (user.loginMethod !== undefined) existing.loginMethod = user.loginMethod ?? null;
    if (user.role !== undefined) existing.role = user.role;
    existing.lastSignedIn = now;
    existing.updatedAt = now;
  } else {
    const nextId = ldb.users.reduce((max, u) => Math.max(max, u.id), 0) + 1;
    ldb.users.push({
      id: nextId,
      openId: user.openId,
      name: user.name ? user.name.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim() : `成員 ${nextId}`,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? "direct",
      role: user.openId === ENV.ownerOpenId ? "admin" : (user.role ?? "user"),
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    });
  }
  saveLocalDb(ldb);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      if (result.length > 0) return result[0];
    } catch (err) {
      console.warn("[Database] Remote getUserByOpenId failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const found = ldb.users.find(u => u.openId === openId);
  if (found) {
    return {
      ...found,
      createdAt: new Date(found.createdAt),
      updatedAt: new Date(found.updatedAt),
      lastSignedIn: new Date(found.lastSignedIn),
    };
  }
  return undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (result.length > 0) return result[0];
    } catch (err) {
      console.warn("[Database] Remote getUserById failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const found = ldb.users.find(u => u.id === id);
  if (found) {
    return {
      ...found,
      createdAt: new Date(found.createdAt),
      updatedAt: new Date(found.updatedAt),
      lastSignedIn: new Date(found.lastSignedIn),
    };
  }
  return undefined;
}

// ===== Team Members =====

export const MAX_TEAM_MEMBERS = 4;

export function formatMemberName(rawName: string | null | undefined, fallbackId?: number): string {
  if (!rawName) return fallbackId ? `成員 ${fallbackId}` : "未命名成員";
  // Strip any role suffixes in parentheses/brackets e.g. (總策展), （總策展）, [總策展], 【總策展】
  const cleaned = rawName.replace(/\s*[（(\[【][^）)\]】]*[）)\]】]\s*/g, "").trim();
  return cleaned || rawName.trim() || (fallbackId ? `成員 ${fallbackId}` : "未命名成員");
}

export const DEFAULT_FOUNDING_MEMBERS = [
  { id: 1, name: "狗狗 QAQ", email: "austingu99@gmail.com" },
  { id: 2, name: "阿科", email: "curtis0955831336@gmail.com" },
  { id: 3, name: "招商經理", email: "vendor@hangoutmarket.com" },
  { id: 4, name: "行銷公關", email: "marketing@hangoutmarket.com" },
];

export async function getTeamMembers() {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
        .from(users)
        .orderBy(users.id);

      if (result.length > 0) {
        return result.map(m => ({
          id: m.id,
          name: formatMemberName(m.name, m.id),
          email: m.email,
        }));
      }
    } catch (err) {
      console.warn("[Database] Failed to query remote team members, using local fallback:", err);
      _dbFailed = true;
    }
  }

  const ldb = loadLocalDb();
  if (ldb.users && ldb.users.length > 0) {
    return ldb.users.map(u => ({
      id: u.id,
      name: formatMemberName(u.name, u.id),
      email: u.email,
    }));
  }

  return DEFAULT_FOUNDING_MEMBERS.map(m => ({
    id: m.id,
    name: formatMemberName(m.name, m.id),
    email: m.email,
  }));
}

export async function addTeamMember(data: { name: string; email?: string | null }): Promise<number> {
  const cleanName = formatMemberName(data.name);
  const db = await getDb();
  if (db) {
    try {
      const openId = `custom_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const result = await db.insert(users).values({
        openId,
        name: cleanName,
        email: data.email ?? null,
        loginMethod: "direct",
        role: "user",
      });
      return result[0].insertId;
    } catch (err) {
      console.warn("[Database] Remote addTeamMember failed, updating local store:", err);
      _dbFailed = true;
    }
  }

  const ldb = loadLocalDb();
  const nextId = ldb.users.reduce((max, u) => Math.max(max, u.id), 0) + 1;
  const now = new Date().toISOString();
  ldb.users.push({
    id: nextId,
    openId: `custom_user_${nextId}_${Date.now()}`,
    name: cleanName,
    email: data.email ?? null,
    loginMethod: "direct",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  });
  saveLocalDb(ldb);
  return nextId;
}

export async function deleteTeamMember(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(users).where(eq(users.id, id));
    } catch (err) {
      console.warn("[Database] Remote deleteTeamMember failed, updating local store:", err);
      _dbFailed = true;
    }
  }

  const ldb = loadLocalDb();
  ldb.users = ldb.users.filter(u => u.id !== id);
  saveLocalDb(ldb);
}

export async function updateTeamMember(id: number, data: { name: string; email?: string | null }): Promise<void> {
  const cleanName = formatMemberName(data.name, id);
  const db = await getDb();
  if (db) {
    try {
      const updateData: Record<string, unknown> = { name: cleanName };
      if (data.email !== undefined) updateData.email = data.email;
      await db.update(users).set(updateData).where(eq(users.id, id));
    } catch (err) {
      console.warn("[Database] Remote updateTeamMember failed, updating local store:", err);
      _dbFailed = true;
    }
  }

  const ldb = loadLocalDb();
  const user = ldb.users.find(u => u.id === id);
  if (user) {
    user.name = cleanName;
    if (data.email !== undefined) user.email = data.email;
    user.updatedAt = new Date().toISOString();
  } else {
    ldb.users.push({
      id,
      openId: `custom_user_${id}`,
      name: cleanName,
      email: data.email ?? null,
      loginMethod: "direct",
      role: id === 1 ? "admin" : "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSignedIn: new Date().toISOString(),
    });
  }
  saveLocalDb(ldb);
}

export async function isRosterMember(userId: number): Promise<boolean> {
  return userId > 0;
}

// ===== Editions =====

export async function getEditions() {
  const db = await getDb();
  if (db) {
    try {
      const allEditions = await db.select().from(editions).orderBy(asc(editions.ordinal));
      const allTasks = await db.select({ id: tasks.id, editionId: tasks.editionId, status: tasks.status }).from(tasks);
      const taskCountMap = new Map<number, number>();
      const doneCountMap = new Map<number, number>();

      for (const t of allTasks) {
        if (t.editionId) {
          taskCountMap.set(t.editionId, (taskCountMap.get(t.editionId) ?? 0) + 1);
          if (t.status === "done") {
            doneCountMap.set(t.editionId, (doneCountMap.get(t.editionId) ?? 0) + 1);
          }
        }
      }

      return allEditions.map(e => ({
        ...e,
        taskCount: taskCountMap.get(e.id) ?? 0,
        doneCount: doneCountMap.get(e.id) ?? 0,
      }));
    } catch (err) {
      console.warn("[Database] Remote getEditions failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  return ldb.editions.map(e => {
    const eTasks = ldb.tasks.filter(t => t.editionId === e.id);
    return {
      id: e.id,
      name: e.name,
      ordinal: e.ordinal,
      eventDate: e.eventDate ? new Date(e.eventDate) : null,
      note: e.note,
      isActive: e.isActive,
      archivedAt: e.archivedAt ? new Date(e.archivedAt) : null,
      createdById: e.createdById,
      createdAt: new Date(e.createdAt),
      updatedAt: new Date(e.updatedAt),
      taskCount: eTasks.length,
      doneCount: eTasks.filter(t => t.status === "done").length,
    };
  });
}

export async function getActiveEdition() {
  const all = await getEditions();
  if (all.length === 0) return null;
  const active = all.find(e => e.isActive);
  return active || all[0];
}

export async function createEdition(data: {
  name?: string | null;
  eventDate?: Date | null;
  note?: string | null;
  createdById?: number | null;
}): Promise<number> {
  const db = await getDb();
  if (db) {
    try {
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
    } catch (err) {
      console.warn("[Database] Remote createEdition failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const nextOrdinal = ldb.editions.reduce((max, e) => Math.max(max, e.ordinal), 0) + 1;
  const nextId = ldb.editions.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const isFirst = ldb.editions.length === 0;
  const now = new Date().toISOString();

  const newEdition: StoredEdition = {
    id: nextId,
    name: data.name?.trim() ? data.name.trim() : null,
    ordinal: nextOrdinal,
    eventDate: data.eventDate ? data.eventDate.toISOString() : null,
    note: data.note ?? null,
    isActive: isFirst,
    archivedAt: null,
    createdById: data.createdById ?? null,
    createdAt: now,
    updatedAt: now,
  };

  ldb.editions.push(newEdition);
  saveLocalDb(ldb);
  return nextId;
}

export async function updateEdition(id: number, data: {
  name?: string | null;
  eventDate?: Date | null;
  note?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name?.trim() ? data.name.trim() : null;
      if (data.eventDate !== undefined) updateData.eventDate = data.eventDate;
      if (data.note !== undefined) updateData.note = data.note;

      if (Object.keys(updateData).length > 0) {
        await db.update(editions).set(updateData).where(eq(editions.id, id));
      }
    } catch (err) {
      console.warn("[Database] Remote updateEdition failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const ed = ldb.editions.find(e => e.id === id);
  if (ed) {
    if (data.name !== undefined) ed.name = data.name?.trim() ? data.name.trim() : null;
    if (data.eventDate !== undefined) ed.eventDate = data.eventDate ? data.eventDate.toISOString() : null;
    if (data.note !== undefined) ed.note = data.note ?? null;
    ed.updatedAt = new Date().toISOString();
    saveLocalDb(ldb);
  }
}

export async function setActiveEdition(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.update(editions).set({ isActive: false }).where(eq(editions.isActive, true));
      await db.update(editions).set({ isActive: true }).where(eq(editions.id, id));
    } catch (err) {
      console.warn("[Database] Remote setActiveEdition failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  for (const e of ldb.editions) {
    e.isActive = e.id === id;
  }
  saveLocalDb(ldb);
}

export async function deleteEdition(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(tasks).where(eq(tasks.editionId, id));
      await db.delete(editions).where(eq(editions.id, id));
    } catch (err) {
      console.warn("[Database] Remote deleteEdition failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  ldb.tasks = ldb.tasks.filter(t => t.editionId !== id);
  ldb.editions = ldb.editions.filter(e => e.id !== id);
  if (!ldb.editions.some(e => e.isActive) && ldb.editions.length > 0) {
    ldb.editions[0].isActive = true;
  }
  saveLocalDb(ldb);
}

export async function duplicateEditionTasks(params: {
  sourceEditionId: number;
  targetEditionId: number;
  categories?: TaskCategory[];
  keepAssignees: boolean;
  createdById: number;
}): Promise<number> {
  const sourceTasks = await getAllTasks(params.sourceEditionId);
  const filtered = params.categories && params.categories.length > 0
    ? sourceTasks.filter(t => params.categories!.includes(t.category))
    : sourceTasks;

  for (const t of filtered) {
    await createTask({
      title: t.title,
      editionId: params.targetEditionId,
      description: t.description ?? undefined,
      category: t.category,
      customCategory: t.customCategory,
      notes: null,
      cloudLink: t.cloudLink,
      assigneeId: params.keepAssignees ? t.assigneeId : null,
      dueDate: null,
      status: "pending",
      createdById: params.createdById,
    });
  }

  return filtered.length;
}

// ===== Task Queries & Mutations =====

export async function getAllTasks(editionId?: number): Promise<TaskWithAssignee[]> {
  const members = await getTeamMembers();
  const userMap = new Map(members.map(u => [u.id, u.name ?? null]));

  let targetEditionId = editionId;
  if (targetEditionId === -1 || targetEditionId === undefined) {
    const active = await getActiveEdition();
    if (active) targetEditionId = active.id;
  }

  const db = await getDb();
  if (db) {
    try {
      const where = targetEditionId && targetEditionId > 0 ? eq(tasks.editionId, targetEditionId) : undefined;
      const allTasks = where
        ? await db.select().from(tasks).where(where).orderBy(tasks.sortOrder, tasks.createdAt)
        : await db.select().from(tasks).orderBy(tasks.sortOrder, tasks.createdAt);
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
    } catch (err) {
      console.warn("[Database] Remote getAllTasks failed, using local store:", err);
      _dbFailed = true;
    }
  }

  const ldb = loadLocalDb();
  let taskList = ldb.tasks;
  if (targetEditionId !== undefined && targetEditionId > 0) {
    taskList = taskList.filter(t => t.editionId === targetEditionId);
  }

  taskList.sort((a, b) => (a.sortOrder - b.sortOrder) || (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));

  return taskList.map(t => ({
    id: t.id,
    editionId: t.editionId ?? null,
    title: t.title,
    description: t.description ?? null,
    category: t.category,
    customCategory: t.customCategory ?? null,
    notes: t.notes ?? null,
    cloudLink: t.cloudLink ?? null,
    assigneeId: t.assigneeId ?? null,
    assigneeName: t.assigneeId ? userMap.get(t.assigneeId) ?? null : null,
    dueDate: t.dueDate ? new Date(t.dueDate) : null,
    status: t.status,
    completedAt: t.completedAt ? new Date(t.completedAt) : null,
    completedById: t.completedById ?? null,
    completedByName: t.completedById ? userMap.get(t.completedById) ?? null : null,
    createdById: t.createdById,
    createdByName: userMap.get(t.createdById) ?? null,
    sortOrder: t.sortOrder,
    attachmentCount: ldb.taskAttachments.filter(a => a.taskId === t.id).length,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  }));
}

export async function getTasksByAssignee(userId: number, editionId?: number): Promise<TaskWithAssignee[]> {
  const all = await getAllTasks(editionId);
  return all.filter(t => t.assigneeId === userId);
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
  let targetEditionId = (data.editionId && data.editionId > 0) ? data.editionId : null;
  if (!targetEditionId) {
    const active = await getActiveEdition();
    if (active) {
      targetEditionId = active.id;
    }
  }

  const db = await getDb();
  if (db) {
    try {
      const result = await db.insert(tasks).values({
        title: data.title.trim(),
        editionId: targetEditionId,
        description: data.description ?? null,
        category: data.category,
        customCategory: data.customCategory ?? null,
        notes: data.notes ?? null,
        cloudLink: data.cloudLink ?? null,
        assigneeId: (data.assigneeId && data.assigneeId > 0) ? data.assigneeId : null,
        dueDate: data.dueDate ?? null,
        status: data.status ?? "pending",
        createdById: data.createdById || 1,
      });
      return result[0].insertId;
    } catch (err) {
      console.warn("[Database] Remote createTask failed, using local store:", err);
      _dbFailed = true;
    }
  }

  // Local store fallback
  const ldb = loadLocalDb();
  const nextId = ldb.tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  const now = new Date().toISOString();

  let finalEditionId = targetEditionId;
  if (!finalEditionId && ldb.editions.length > 0) {
    const active = ldb.editions.find(e => e.isActive) || ldb.editions[0];
    finalEditionId = active.id;
  }

  const newTask: StoredTask = {
    id: nextId,
    editionId: finalEditionId,
    title: data.title.trim(),
    description: data.description ?? null,
    category: data.category,
    customCategory: data.customCategory ?? null,
    notes: data.notes ?? null,
    cloudLink: data.cloudLink ?? null,
    assigneeId: (data.assigneeId && data.assigneeId > 0) ? data.assigneeId : null,
    dueDate: data.dueDate ? data.dueDate.toISOString() : null,
    status: data.status ?? "pending",
    completedAt: data.status === "done" ? now : null,
    completedById: data.status === "done" ? (data.createdById || 1) : null,
    createdById: data.createdById || 1,
    sortOrder: ldb.tasks.length + 1,
    createdAt: now,
    updatedAt: now,
  };

  ldb.tasks.push(newTask);
  saveLocalDb(ldb);
  return nextId;
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
  if (db) {
    try {
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
    } catch (err) {
      console.warn("[Database] Remote updateTask failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const t = ldb.tasks.find(x => x.id === id);
  if (t) {
    if (data.title !== undefined) t.title = data.title;
    if (data.editionId !== undefined) t.editionId = data.editionId;
    if (data.description !== undefined) t.description = data.description;
    if (data.category !== undefined) t.category = data.category;
    if (data.customCategory !== undefined) t.customCategory = data.customCategory;
    if (data.notes !== undefined) t.notes = data.notes;
    if (data.cloudLink !== undefined) t.cloudLink = data.cloudLink;
    if (data.assigneeId !== undefined) t.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) t.dueDate = data.dueDate ? data.dueDate.toISOString() : null;
    t.updatedAt = new Date().toISOString();
    saveLocalDb(ldb);
  }
}

export async function setTaskStatus(id: number, status: TaskStatus, userId?: number): Promise<void> {
  const isDone = status === "done";
  const completedAt = isDone ? new Date() : null;
  const completedById = isDone ? (userId ?? null) : null;

  const db = await getDb();
  if (db) {
    try {
      await db.update(tasks).set({
        status,
        completedAt,
        completedById,
      }).where(eq(tasks.id, id));
    } catch (err) {
      console.warn("[Database] Remote setTaskStatus failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const t = ldb.tasks.find(x => x.id === id);
  if (t) {
    t.status = status;
    t.completedAt = completedAt ? completedAt.toISOString() : null;
    t.completedById = completedById;
    t.updatedAt = new Date().toISOString();
    saveLocalDb(ldb);
  }
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(taskAttachments).where(eq(taskAttachments.taskId, id));
      await db.delete(tasks).where(eq(tasks.id, id));
    } catch (err) {
      console.warn("[Database] Remote deleteTask failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  ldb.taskAttachments = ldb.taskAttachments.filter(a => a.taskId !== id);
  ldb.tasks = ldb.tasks.filter(t => t.id !== id);
  saveLocalDb(ldb);
}

// ===== Task Attachments =====

async function getAttachmentCounts(): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.select({ taskId: taskAttachments.taskId }).from(taskAttachments);
      for (const r of rows) map.set(r.taskId, (map.get(r.taskId) ?? 0) + 1);
      return map;
    } catch {}
  }

  const ldb = loadLocalDb();
  for (const a of ldb.taskAttachments) {
    map.set(a.taskId, (map.get(a.taskId) ?? 0) + 1);
  }
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
  const members = await getTeamMembers();
  const userMap = new Map(members.map(u => [u.id, u.name ?? null]));

  const db = await getDb();
  if (db) {
    try {
      const rows = await db
        .select()
        .from(taskAttachments)
        .where(eq(taskAttachments.taskId, taskId))
        .orderBy(taskAttachments.createdAt);

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
    } catch (err) {
      console.warn("[Database] Remote getTaskAttachments failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  return ldb.taskAttachments
    .filter(a => a.taskId === taskId)
    .map(a => ({
      id: a.id,
      taskId: a.taskId,
      fileName: a.fileName,
      url: a.url,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      uploadedById: a.uploadedById,
      uploadedByName: userMap.get(a.uploadedById) ?? null,
      createdAt: new Date(a.createdAt),
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
  if (db) {
    try {
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
    } catch (err) {
      console.warn("[Database] Remote addTaskAttachment failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const nextId = ldb.taskAttachments.reduce((max, a) => Math.max(max, a.id), 0) + 1;
  ldb.taskAttachments.push({
    id: nextId,
    taskId: data.taskId,
    fileName: data.fileName,
    fileKey: data.fileKey,
    url: data.url,
    mimeType: data.mimeType ?? null,
    fileSize: data.fileSize ?? null,
    uploadedById: data.uploadedById,
    createdAt: new Date().toISOString(),
  });
  saveLocalDb(ldb);
  return nextId;
}

export async function deleteTaskAttachment(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(taskAttachments).where(eq(taskAttachments.id, id));
    } catch (err) {
      console.warn("[Database] Remote deleteTaskAttachment failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  ldb.taskAttachments = ldb.taskAttachments.filter(a => a.id !== id);
  saveLocalDb(ldb);
}

export async function getTaskStats(editionId?: number): Promise<{
  byCategory: Record<string, { total: number; done: number; inProgress: number; pending: number; percentage: number }>;
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  percentage: number;
}> {
  const allTasks = await getAllTasks(editionId);
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
  if (db) {
    try {
      const result = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
      if (result.length > 0) return result[0];
    } catch (err) {
      console.warn("[Database] Remote getAppSettings failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  if (!ldb.appSettings) {
    return {
      id: 1,
      marketEventDate: new Date("2027-02-27T00:00:00.000Z"),
      marketEventName: "咻一下市集 第一屆",
      updatedAt: new Date(),
    };
  }

  return {
    id: ldb.appSettings.id,
    marketEventDate: ldb.appSettings.marketEventDate ? new Date(ldb.appSettings.marketEventDate) : null,
    marketEventName: ldb.appSettings.marketEventName,
    updatedAt: new Date(ldb.appSettings.updatedAt),
  };
}

export async function updateAppSettings(data: {
  marketEventDate?: Date | null;
  marketEventName?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.marketEventDate !== undefined) updateData.marketEventDate = data.marketEventDate;
      if (data.marketEventName !== undefined) updateData.marketEventName = data.marketEventName;

      if (Object.keys(updateData).length > 0) {
        const existing = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
        if (existing.length === 0) {
          await db.insert(appSettings).values({
            id: 1,
            marketEventDate: data.marketEventDate ?? null,
            marketEventName: data.marketEventName ?? null,
          });
        } else {
          await db.update(appSettings).set(updateData).where(eq(appSettings.id, 1));
        }
      }
    } catch (err) {
      console.warn("[Database] Remote updateAppSettings failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const now = new Date().toISOString();
  if (!ldb.appSettings) {
    ldb.appSettings = {
      id: 1,
      marketEventDate: data.marketEventDate ? data.marketEventDate.toISOString() : null,
      marketEventName: data.marketEventName ?? null,
      updatedAt: now,
    };
  } else {
    if (data.marketEventDate !== undefined) ldb.appSettings.marketEventDate = data.marketEventDate ? data.marketEventDate.toISOString() : null;
    if (data.marketEventName !== undefined) ldb.appSettings.marketEventName = data.marketEventName ?? null;
    ldb.appSettings.updatedAt = now;
  }
  saveLocalDb(ldb);
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
  const members = await getTeamMembers();
  const userMap = new Map(members.map(u => [u.id, u.name ?? null]));

  const db = await getDb();
  if (db) {
    try {
      const rows = persona
        ? await db
            .select()
            .from(aiMessages)
            .where(eq(aiMessages.persona, persona))
            .orderBy(aiMessages.id)
            .limit(limit)
        : await db
            .select()
            .from(aiMessages)
            .orderBy(aiMessages.id)
            .limit(limit);

      return rows.map(r => ({
        id: r.id,
        persona: (r.persona as AiPersona) ?? "curation",
        role: r.role,
        content: r.content,
        authorId: r.authorId,
        authorName: r.authorId ? userMap.get(r.authorId) ?? null : null,
        createdAt: r.createdAt,
      }));
    } catch (err) {
      console.warn("[Database] Remote getAiMessages failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  let msgs = ldb.aiMessages;
  if (persona) {
    msgs = msgs.filter(m => m.persona === persona);
  }
  return msgs.slice(-limit).map(m => ({
    id: m.id,
    persona: m.persona,
    role: m.role,
    content: m.content,
    authorId: m.authorId,
    authorName: m.authorId ? userMap.get(m.authorId) ?? null : null,
    createdAt: new Date(m.createdAt),
  }));
}

export async function addAiMessage(data: {
  persona?: AiPersona;
  role: "user" | "assistant";
  content: string;
  authorId?: number | null;
}): Promise<number> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.insert(aiMessages).values({
        persona: data.persona ?? "curation",
        role: data.role,
        content: data.content,
        authorId: data.authorId ?? null,
      });
      return result[0].insertId;
    } catch (err) {
      console.warn("[Database] Remote addAiMessage failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const nextId = ldb.aiMessages.reduce((max, m) => Math.max(max, m.id), 0) + 1;
  ldb.aiMessages.push({
    id: nextId,
    persona: data.persona ?? "curation",
    role: data.role,
    content: data.content,
    authorId: data.authorId ?? null,
    createdAt: new Date().toISOString(),
  });
  saveLocalDb(ldb);
  return nextId;
}

export async function clearAiMessages(persona?: AiPersona): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      if (persona) {
        await db.delete(aiMessages).where(eq(aiMessages.persona, persona));
      } else {
        await db.delete(aiMessages);
      }
    } catch (err) {
      console.warn("[Database] Remote clearAiMessages failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  if (persona) {
    ldb.aiMessages = ldb.aiMessages.filter(m => m.persona !== persona);
  } else {
    ldb.aiMessages = [];
  }
  saveLocalDb(ldb);
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
  const members = await getTeamMembers();
  const userMap = new Map(members.map(u => [u.id, u.name ?? null]));

  const db = await getDb();
  if (db) {
    try {
      const folders = await db
        .select()
        .from(resourceFolders)
        .orderBy(resourceFolders.sortOrder, resourceFolders.createdAt);
      const itemRows = await db.select({ folderId: resourceItems.folderId }).from(resourceItems);
      const counts = new Map<number, number>();
      for (const r of itemRows) counts.set(r.folderId, (counts.get(r.folderId) ?? 0) + 1);

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
    } catch (err) {
      console.warn("[Database] Remote getResourceFolders failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  return ldb.resourceFolders.map(f => ({
    id: f.id,
    name: f.name,
    description: f.description,
    sortOrder: f.sortOrder,
    itemCount: ldb.resourceItems.filter(i => i.folderId === f.id).length,
    createdById: f.createdById,
    createdByName: userMap.get(f.createdById) ?? null,
    createdAt: new Date(f.createdAt),
    updatedAt: new Date(f.updatedAt),
  }));
}

export async function createResourceFolder(data: {
  name: string;
  description?: string | null;
  createdById: number;
}): Promise<number> {
  const db = await getDb();
  if (db) {
    try {
      const existing = await db.select({ sortOrder: resourceFolders.sortOrder }).from(resourceFolders);
      const nextOrder = existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;

      const result = await db.insert(resourceFolders).values({
        name: data.name,
        description: data.description ?? null,
        sortOrder: nextOrder,
        createdById: data.createdById,
      });
      return result[0].insertId;
    } catch (err) {
      console.warn("[Database] Remote createResourceFolder failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const nextId = ldb.resourceFolders.reduce((max, f) => Math.max(max, f.id), 0) + 1;
  const nextOrder = ldb.resourceFolders.reduce((max, f) => Math.max(max, f.sortOrder), 0) + 1;
  const now = new Date().toISOString();

  ldb.resourceFolders.push({
    id: nextId,
    name: data.name,
    description: data.description ?? null,
    sortOrder: nextOrder,
    createdById: data.createdById,
    createdAt: now,
    updatedAt: now,
  });
  saveLocalDb(ldb);
  return nextId;
}

export async function updateResourceFolder(
  id: number,
  data: { name?: string; description?: string | null }
): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (Object.keys(updateData).length > 0) {
        await db.update(resourceFolders).set(updateData).where(eq(resourceFolders.id, id));
      }
    } catch (err) {
      console.warn("[Database] Remote updateResourceFolder failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const f = ldb.resourceFolders.find(x => x.id === id);
  if (f) {
    if (data.name !== undefined) f.name = data.name;
    if (data.description !== undefined) f.description = data.description;
    f.updatedAt = new Date().toISOString();
    saveLocalDb(ldb);
  }
}

export async function deleteResourceFolder(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(resourceItems).where(eq(resourceItems.folderId, id));
      await db.delete(resourceFolders).where(eq(resourceFolders.id, id));
    } catch (err) {
      console.warn("[Database] Remote deleteResourceFolder failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  ldb.resourceItems = ldb.resourceItems.filter(i => i.folderId !== id);
  ldb.resourceFolders = ldb.resourceFolders.filter(f => f.id !== id);
  saveLocalDb(ldb);
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
  const members = await getTeamMembers();
  const userMap = new Map(members.map(u => [u.id, u.name ?? null]));

  const db = await getDb();
  if (db) {
    try {
      const rows = folderId
        ? await db.select().from(resourceItems).where(eq(resourceItems.folderId, folderId)).orderBy(resourceItems.createdAt)
        : await db.select().from(resourceItems).orderBy(resourceItems.createdAt);

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
    } catch (err) {
      console.warn("[Database] Remote getResourceItems failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  let items = ldb.resourceItems;
  if (folderId) {
    items = items.filter(i => i.folderId === folderId);
  }

  return items.map(r => ({
    id: r.id,
    folderId: r.folderId,
    kind: r.kind,
    title: r.title,
    note: r.note,
    linkUrl: r.linkUrl,
    fileUrl: r.fileUrl,
    fileName: r.fileName,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    uploadedById: r.uploadedById,
    uploadedByName: userMap.get(r.uploadedById) ?? null,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
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
  if (db) {
    try {
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
    } catch (err) {
      console.warn("[Database] Remote createResourceItem failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const nextId = ldb.resourceItems.reduce((max, i) => Math.max(max, i.id), 0) + 1;
  const now = new Date().toISOString();

  ldb.resourceItems.push({
    id: nextId,
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
    createdAt: now,
    updatedAt: now,
  });
  saveLocalDb(ldb);
  return nextId;
}

export async function updateResourceItem(
  id: number,
  data: { title?: string; note?: string | null; linkUrl?: string | null; folderId?: number }
): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.note !== undefined) updateData.note = data.note;
      if (data.linkUrl !== undefined) updateData.linkUrl = data.linkUrl;
      if (data.folderId !== undefined) updateData.folderId = data.folderId;
      if (Object.keys(updateData).length > 0) {
        await db.update(resourceItems).set(updateData).where(eq(resourceItems.id, id));
      }
    } catch (err) {
      console.warn("[Database] Remote updateResourceItem failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  const item = ldb.resourceItems.find(i => i.id === id);
  if (item) {
    if (data.title !== undefined) item.title = data.title;
    if (data.note !== undefined) item.note = data.note;
    if (data.linkUrl !== undefined) item.linkUrl = data.linkUrl;
    if (data.folderId !== undefined) item.folderId = data.folderId;
    item.updatedAt = new Date().toISOString();
    saveLocalDb(ldb);
  }
}

export async function deleteResourceItem(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(resourceItems).where(eq(resourceItems.id, id));
    } catch (err) {
      console.warn("[Database] Remote deleteResourceItem failed, using local store:", err);
    }
  }

  const ldb = loadLocalDb();
  ldb.resourceItems = ldb.resourceItems.filter(i => i.id !== id);
  saveLocalDb(ldb);
}

// ===== Seed Official Timeline =====

export async function seedOfficialTimeline(editionId?: number | null, createdById?: number): Promise<number> {
  let targetEditionId = editionId;
  if (!targetEditionId) {
    const active = await getActiveEdition();
    if (active) {
      targetEditionId = active.id;
    } else {
      targetEditionId = await createEdition({
        name: "咻一下市集 第一屆【商模初綻與品牌落地】",
        eventDate: new Date("2027-02-27"),
        note: "05-06月商模建立、07-08月法律營運、09-10月資源開發、11-01月招商行銷衝刺、02-03月正式舉行與復盤",
        createdById: createdById ?? 1,
      });
    }
  }

  for (const item of OFFICIAL_TIMELINE_TASKS) {
    await createTask({
      title: item.title,
      editionId: targetEditionId,
      description: item.description,
      category: item.category,
      customCategory: null,
      notes: item.notes,
      cloudLink: null,
      assigneeId: null,
      dueDate: item.dueDate,
      status: item.status,
      createdById: createdById ?? 1,
    });
  }

  return OFFICIAL_TIMELINE_TASKS.length;
}
