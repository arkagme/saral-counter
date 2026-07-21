import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const HISTORY_FILE = "user-history.json";

interface HistoryEntry {
  date: string;
  count: number;
}

interface HistoryData {
  history: HistoryEntry[];
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readHistory(): Promise<HistoryEntry[]> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, HISTORY_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data: HistoryData = JSON.parse(raw);
    return data.history || [];
  } catch {
    return [];
  }
}

export async function writeHistory(history: HistoryEntry[]): Promise<string> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, HISTORY_FILE);
  const data: HistoryData = { history };
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
}
