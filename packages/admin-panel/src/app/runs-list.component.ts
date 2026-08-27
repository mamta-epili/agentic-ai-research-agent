import { Component, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { RunsService, Run } from "./runs.service";

@Component({
  selector: "app-runs-list",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="toolbar">
      <h2>Runs</h2>
      <div class="controls">
        <input
          type="search"
          [(ngModel)]="q"
          (ngModelChange)="onFilter()"
          placeholder="Search query…"
        />
        <select [(ngModel)]="status" (ngModelChange)="onFilter()">
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
        </select>
        <label class="live">
          <input type="checkbox" [(ngModel)]="live" (ngModelChange)="toggleLive()" />
          Live
        </label>
        <button (click)="load()">Refresh</button>
      </div>
    </div>

    <div class="statusbar">
      <span class="count">{{ runs.length }} run{{ runs.length === 1 ? "" : "s" }}</span>
      <span class="running-dot" *ngIf="runningCount() > 0">
        <span class="dot"></span>{{ runningCount() }} running
      </span>
      <span class="live-tag" *ngIf="live">auto-refresh on</span>
    </div>

    <p class="empty" *ngIf="!loading && runs.length === 0 && !error">
      No runs match. Ask the agent something in the chat app, or clear filters.
    </p>
    <p class="empty err" *ngIf="error">{{ error }}</p>

    <table *ngIf="runs.length">
      <thead>
        <tr><th>Query</th><th>Status</th><th>Steps</th><th>Model</th><th>Duration</th><th>When</th><th></th></tr>
      </thead>
      <tbody>
        <tr *ngFor="let r of runs" class="row">
          <td class="q" [routerLink]="['/runs', r.id]">{{ r.query }}</td>
          <td [routerLink]="['/runs', r.id]"><span class="badge" [class]="r.status">{{ r.status }}</span></td>
          <td [routerLink]="['/runs', r.id]">{{ r.steps.length }}</td>
          <td class="mono" [routerLink]="['/runs', r.id]">{{ r.model || "—" }}</td>
          <td class="mono" [routerLink]="['/runs', r.id]">{{ r.durationMs != null ? r.durationMs + " ms" : "—" }}</td>
          <td class="mono when" [routerLink]="['/runs', r.id]">{{ r.createdAt | date: "MMM d, HH:mm:ss" }}</td>
          <td class="actions">
            <button class="mini" title="Re-run" (click)="rerun(r, $event)" [disabled]="busy[r.id]">↻</button>
            <button class="mini danger" title="Delete" (click)="remove(r, $event)" [disabled]="busy[r.id]">✕</button>
          </td>
        </tr>
      </tbody>
    </table>
  `,
  styles: [
    `
      .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
      h2 { font-size: 20px; font-weight: 600; margin: 0; }
      .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      input[type="search"], select {
        border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px;
        font-size: 13px; background: var(--surface); color: var(--ink);
      }
      input[type="search"] { min-width: 180px; }
      input:focus, select:focus { outline: none; border-color: var(--accent); }
      .live { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--muted); cursor: pointer; }
      button {
        border: 1px solid var(--line); background: var(--surface); color: var(--ink);
        border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer;
      }
      button:hover { border-color: var(--accent); color: var(--accent); }
      .statusbar { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
      .count { font-family: var(--mono); font-size: 13px; color: var(--muted); }
      .running-dot { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--tool); font-family: var(--mono); }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tool); animation: pulse 1.2s infinite; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      .live-tag { font-family: var(--mono); font-size: 11px; color: var(--accent); }
      .empty { color: var(--muted); font-size: 14px; padding: 20px 0; }
      .empty.err { color: #b03030; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th {
        text-align: left; font-family: var(--mono); font-size: 11px; text-transform: uppercase;
        letter-spacing: 0.06em; color: var(--muted); font-weight: 500;
        padding: 8px 12px; border-bottom: 1px solid var(--line);
      }
      td { padding: 12px; border-bottom: 1px solid var(--line); vertical-align: top; cursor: pointer; }
      .row:hover td { background: #f4f7f6; }
      .q { max-width: 320px; }
      .mono { font-family: var(--mono); font-size: 12.5px; color: var(--muted); }
      .when { white-space: nowrap; }
      .actions { white-space: nowrap; cursor: default; }
      .mini { padding: 3px 9px; font-size: 13px; line-height: 1; }
      .mini.danger:hover { border-color: #b03030; color: #b03030; }
      .badge {
        font-family: var(--mono); font-size: 11px; padding: 2px 8px; border-radius: 999px;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .badge.completed { background: #e5f2ee; color: var(--accent); }
      .badge.running { background: #fdf1de; color: var(--tool); }
      .badge.failed { background: #f6e3e3; color: #b03030; }
    `,
  ],
})
export class RunsListComponent implements OnInit, OnDestroy {
  runs: Run[] = [];
  loading = false;
  error = "";
  q = "";
  status = "";
  live = false;
  busy: Record<string, boolean> = {};

  private timer?: ReturnType<typeof setInterval>;
  private filterTimer?: ReturnType<typeof setTimeout>;

  constructor(private svc: RunsService, private router: Router) {}

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.filterTimer) clearTimeout(this.filterTimer);
  }

  load() {
    this.loading = true;
    this.error = "";
    this.svc.list({ q: this.q, status: this.status }).subscribe({
      next: (runs) => {
        this.runs = runs;
        this.loading = false;
      },
      error: (err) => {
        this.error =
          err?.status === 401
            ? "Session expired. Redirecting to login…"
            : "Could not reach the agent backend on localhost:4000.";
        this.loading = false;
      },
    });
  }

  onFilter() {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.load(), 250);
  }

  toggleLive() {
    if (this.live) {
      this.timer = setInterval(() => this.load(), 3000);
    } else if (this.timer) {
      clearInterval(this.timer);
    }
  }

  runningCount(): number {
    return this.runs.filter((r) => r.status === "running").length;
  }

  rerun(r: Run, ev: Event) {
    ev.stopPropagation();
    this.busy[r.id] = true;
    this.svc.rerun(r.id).subscribe({
      next: (nr) => {
        this.busy[r.id] = false;
        this.router.navigate(["/runs", nr.id]);
      },
      error: () => {
        this.busy[r.id] = false;
        this.error = "Re-run failed.";
      },
    });
  }

  remove(r: Run, ev: Event) {
    ev.stopPropagation();
    if (!confirm(`Delete this run?\n\n"${r.query}"`)) return;
    this.busy[r.id] = true;
    this.svc.remove(r.id).subscribe({
      next: () => {
        this.busy[r.id] = false;
        this.runs = this.runs.filter((x) => x.id !== r.id);
      },
      error: () => {
        this.busy[r.id] = false;
        this.error = "Delete failed.";
      },
    });
  }
}
