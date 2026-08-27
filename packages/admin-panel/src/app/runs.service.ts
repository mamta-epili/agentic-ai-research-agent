import { Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";

export interface AgentStep {
  index: number;
  kind: "thought" | "tool_call" | "observation" | "final" | "error";
  content: string;
  tool?: string;
  createdAt: string;
}

export interface Run {
  id: string;
  query: string;
  status: "running" | "completed" | "failed";
  steps: AgentStep[];
  answer?: string;
  provider: string;
  model: string;
  createdAt: string;
  durationMs?: number;
}

export interface Stats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
  avgSteps: number;
  avgDurationMs: number;
  toolUsage: { tool: string; count: number }[];
  byDay: { date: string; count: number }[];
  recentQueries: { id: string; query: string; status: string; createdAt: string }[];
}

export interface CorpusDoc {
  id: string;
  title: string;
  snippet: string;
  contentHtml: string | null;
  tags: string[];
  enabled: boolean;
  createdAt: string;
}

export interface ToolConfig {
  name: string;
  enabled: boolean;
  description: string | null;
}

export interface RunFilters {
  status?: string;
  q?: string;
  limit?: number;
}

export const API = "http://localhost:4000";

@Injectable({ providedIn: "root" })
export class RunsService {
  constructor(private http: HttpClient) {}

  // Runs
  list(filters: RunFilters = {}): Observable<Run[]> {
    let params = new HttpParams();
    if (filters.status) params = params.set("status", filters.status);
    if (filters.q) params = params.set("q", filters.q);
    if (filters.limit) params = params.set("limit", String(filters.limit));
    return this.http.get<Run[]>(`${API}/api/runs`, { params });
  }

  get(id: string): Observable<Run> {
    return this.http.get<Run>(`${API}/api/runs/${id}`);
  }

  remove(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/api/runs/${id}`);
  }

  rerun(id: string): Observable<Run> {
    return this.http.post<Run>(`${API}/api/runs/${id}/rerun`, {});
  }

  // Stats
  stats(): Observable<Stats> {
    return this.http.get<Stats>(`${API}/api/stats`);
  }

  // Corpus
  corpusList(): Observable<CorpusDoc[]> {
    return this.http.get<CorpusDoc[]>(`${API}/api/corpus`);
  }

  corpusCreate(doc: Partial<CorpusDoc>): Observable<CorpusDoc> {
    return this.http.post<CorpusDoc>(`${API}/api/corpus`, doc);
  }

  corpusUpdate(id: string, patch: Partial<CorpusDoc>): Observable<CorpusDoc> {
    return this.http.put<CorpusDoc>(`${API}/api/corpus/${id}`, patch);
  }

  corpusDelete(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/api/corpus/${id}`);
  }

  // Upload a PDF / image / text file; returns extracted text for the editor.
  corpusExtract(file: File): Observable<{ text: string; filename: string }> {
    const form = new FormData();
    form.append("file", file);
    return this.http.post<{ text: string; filename: string }>(
      `${API}/api/corpus/extract`,
      form,
    );
  }

  // Tools
  toolsList(): Observable<ToolConfig[]> {
    return this.http.get<ToolConfig[]>(`${API}/api/tools`);
  }

  toolSet(name: string, enabled: boolean): Observable<ToolConfig> {
    return this.http.put<ToolConfig>(`${API}/api/tools/${name}`, { enabled });
  }
}
