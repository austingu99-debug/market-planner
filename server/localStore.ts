import fs from "fs";
import path from "path";
import type { TaskCategory, TaskStatus, AiPersona, ResourceKind } from "../drizzle/schema";
import { OFFICIAL_TIMELINE_TASKS, OFFICIAL_RESOURCE_FOLDERS } from "./seedData";

export type StoredUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt: string;
  updatedAt: string;
  lastSignedIn: string;
};

export type StoredEdition = {
  id: number;
  name: string | null;
  ordinal: number;
  eventDate: string | null;
  note: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredTask = {
  id: number;
  editionId: number | null;
  title: string;
  description: string | null;
  category: TaskCategory;
  customCategory: string | null;
  notes: string | null;
  cloudLink: string | null;
  assigneeId: number | null;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  completedById: number | null;
  createdById: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredAttachment = {
  id: number;
  taskId: number;
  fileName: string;
  fileKey: string;
  url: string;
  mimeType: string | null;
  fileSize: number | null;
  uploadedById: number;
  createdAt: string;
};

export type StoredAiMessage = {
  id: number;
  persona: AiPersona;
  role: "user" | "assistant";
  content: string;
  authorId: number | null;
  createdAt: string;
};

export type StoredResourceFolder = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  createdById: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredResourceItem = {
  id: number;
  folderId: number;
  kind: ResourceKind;
  title: string;
  note: string | null;
  linkUrl: string | null;
  fileKey: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  uploadedById: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalDatabaseData = {
  users: StoredUser[];
  appSettings: {
    id: number;
    marketEventDate: string | null;
    marketEventName: string | null;
    updatedAt: string;
  } | null;
  editions: StoredEdition[];
  tasks: StoredTask[];
  taskAttachments: StoredAttachment[];
  aiMessages: StoredAiMessage[];
  resourceFolders: StoredResourceFolder[];
  resourceItems: StoredResourceItem[];
};

const DB_FILE_PATH = path.resolve(process.cwd(), "server", "data", "market_planner_db.json");

const DEFAULT_USERS: StoredUser[] = [
  {
    id: 1,
    openId: "default_founder",
    name: "狗狗 QAQ",
    email: "austingu99@gmail.com",
    loginMethod: "direct",
    role: "admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSignedIn: new Date().toISOString(),
  },
  {
    id: 2,
    openId: "user_curtis",
    name: "阿科",
    email: "curtis0955831336@gmail.com",
    loginMethod: "direct",
    role: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSignedIn: new Date().toISOString(),
  },
  {
    id: 3,
    openId: "user_vendor",
    name: "招商經理",
    email: "vendor@hangoutmarket.com",
    loginMethod: "direct",
    role: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSignedIn: new Date().toISOString(),
  },
  {
    id: 4,
    openId: "user_marketing",
    name: "行銷公關",
    email: "marketing@hangoutmarket.com",
    loginMethod: "direct",
    role: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSignedIn: new Date().toISOString(),
  },
];

function createInitialData(): LocalDatabaseData {
  const now = new Date().toISOString();
  const defaultEdition: StoredEdition = {
    id: 1,
    name: "咻一下市集 第一屆【商模初綻與品牌落地】",
    ordinal: 1,
    eventDate: "2027-02-27T00:00:00.000Z",
    note: "05-06月商模建立、07-08月法律營運、09-10月資源開發、11-01月招商行銷衝刺、02-03月正式舉行與復盤",
    isActive: true,
    archivedAt: null,
    createdById: 1,
    createdAt: now,
    updatedAt: now,
  };

  const initialTasks: StoredTask[] = OFFICIAL_TIMELINE_TASKS.map((t, idx) => ({
    id: idx + 1,
    editionId: 1,
    title: t.title,
    description: t.description ?? null,
    category: t.category,
    customCategory: null,
    notes: t.notes ?? null,
    cloudLink: null,
    assigneeId: null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    status: t.status,
    completedAt: t.status === "done" ? now : null,
    completedById: t.status === "done" ? 1 : null,
    createdById: 1,
    sortOrder: t.sortOrder,
    createdAt: now,
    updatedAt: now,
  }));

  const folders: StoredResourceFolder[] = [];
  const items: StoredResourceItem[] = [];

  let folderIdCounter = 1;
  let itemIdCounter = 1;

  for (const f of OFFICIAL_RESOURCE_FOLDERS) {
    const folderId = folderIdCounter++;
    folders.push({
      id: folderId,
      name: f.name,
      description: f.description ?? null,
      sortOrder: folders.length + 1,
      createdById: 1,
      createdAt: now,
      updatedAt: now,
    });

    for (const it of f.items) {
      items.push({
        id: itemIdCounter++,
        folderId,
        kind: it.kind,
        title: it.title,
        note: it.note ?? null,
        linkUrl: it.linkUrl ?? null,
        fileKey: null,
        fileUrl: null,
        fileName: null,
        mimeType: null,
        fileSize: null,
        uploadedById: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return {
    users: DEFAULT_USERS,
    appSettings: {
      id: 1,
      marketEventDate: "2027-02-27T00:00:00.000Z",
      marketEventName: "咻一下市集 第一屆",
      updatedAt: now,
    },
    editions: [defaultEdition],
    tasks: initialTasks,
    taskAttachments: [],
    aiMessages: [],
    resourceFolders: folders,
    resourceItems: items,
  };
}

let cachedData: LocalDatabaseData | null = null;

export function loadLocalDb(): LocalDatabaseData {
  if (cachedData) return cachedData;

  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, "utf-8");
      cachedData = JSON.parse(raw);
      // Clean up legacy parentheses if present in users
      if (cachedData?.users) {
        for (const u of cachedData.users) {
          if (u.name) {
            u.name = u.name.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim();
          }
        }
      }
      return cachedData!;
    }
  } catch (err) {
    console.warn("[LocalStore] Failed to read local db file, initializing default:", err);
  }

  cachedData = createInitialData();
  saveLocalDb(cachedData);
  return cachedData;
}

export function saveLocalDb(data: LocalDatabaseData) {
  try {
    cachedData = data;
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[LocalStore] Failed to save local db:", err);
  }
}
