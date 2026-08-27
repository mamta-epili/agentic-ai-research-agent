import { listRuns } from "./runs.js";

// Metrics for the admin dashboard, computed from the runs table.

export interface Stats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number; // 0..1 over finished runs
  avgSteps: number;
  avgDurationMs: number;
  toolUsage: { tool: string; count: number }[];
  byDay: { date: string; count: number }[]; // last 7 days, oldest first
  recentQueries: { id: string; query: string; status: string; createdAt: string }[];
}

export async function getStats(): Promise<Stats> {
  const runs = await listRuns();
  const total = runs.length;
  const completed = runs.filter((r) => r.status === "completed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const running = runs.filter((r) => r.status === "running").length;
  const finished = completed + failed;

  const durations = runs.map((r) => r.durationMs).filter((d): d is number => d != null);
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  const stepCounts = runs.map((r) => r.steps.length);
  const avgSteps = stepCounts.length
    ? Math.round((stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length) * 10) / 10
    : 0;

  const toolCounts = new Map<string, number>();
  for (const r of runs) {
    for (const s of r.steps) {
      if (s.kind === "tool_call" && s.tool) {
        toolCounts.set(s.tool, (toolCounts.get(s.tool) ?? 0) + 1);
      }
    }
  }
  const toolUsage = [...toolCounts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);

  // Runs per day for the last 7 days (UTC).
  const byDay: { date: string; count: number }[] = [];
  const dayMap = new Map<string, number>();
  for (const r of runs) {
    const day = r.createdAt.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay.push({ date: key, count: dayMap.get(key) ?? 0 });
  }

  const recentQueries = runs.slice(0, 5).map((r) => ({
    id: r.id,
    query: r.query,
    status: r.status,
    createdAt: r.createdAt,
  }));

  return {
    total,
    completed,
    failed,
    running,
    successRate: finished ? completed / finished : 0,
    avgSteps,
    avgDurationMs,
    toolUsage,
    byDay,
    recentQueries,
  };
}
