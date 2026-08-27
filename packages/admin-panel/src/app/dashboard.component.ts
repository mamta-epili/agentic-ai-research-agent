import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { RunsService, Stats } from "./runs.service";

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="toolbar">
      <h2>Dashboard</h2>
      <button (click)="load()">Refresh</button>
    </div>

    <p class="empty" *ngIf="error">{{ error }}</p>

    <ng-container *ngIf="stats as s">
      <div class="cards">
        <div class="card"><span class="k">Total runs</span><span class="v">{{ s.total }}</span></div>
        <div class="card"><span class="k">Success rate</span><span class="v">{{ (s.successRate * 100) | number: "1.0-0" }}%</span></div>
        <div class="card"><span class="k">Avg steps</span><span class="v">{{ s.avgSteps }}</span></div>
        <div class="card"><span class="k">Avg latency</span><span class="v">{{ s.avgDurationMs }} ms</span></div>
        <div class="card"><span class="k">Completed</span><span class="v ok">{{ s.completed }}</span></div>
        <div class="card"><span class="k">Failed</span><span class="v bad">{{ s.failed }}</span></div>
      </div>

      <div class="grid">
        <section class="panel">
          <h3>Runs (last 7 days)</h3>
          <div class="bars">
            <div class="bar-row" *ngFor="let d of s.byDay">
              <span class="bar-label">{{ d.date | date: "MMM d" }}</span>
              <div class="bar-track">
                <div class="bar-fill" [style.width.%]="pct(d.count, maxDay(s))"></div>
              </div>
              <span class="bar-val">{{ d.count }}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <h3>Tool usage</h3>
          <p class="empty small" *ngIf="!s.toolUsage.length">No tool calls yet.</p>
          <div class="bars" *ngIf="s.toolUsage.length">
            <div class="bar-row" *ngFor="let t of s.toolUsage">
              <span class="bar-label mono">{{ t.tool }}</span>
              <div class="bar-track">
                <div class="bar-fill tool" [style.width.%]="pct(t.count, maxTool(s))"></div>
              </div>
              <span class="bar-val">{{ t.count }}</span>
            </div>
          </div>
        </section>
      </div>

      <section class="panel">
        <h3>Recent queries</h3>
        <p class="empty small" *ngIf="!s.recentQueries.length">No runs yet.</p>
        <ul class="recent">
          <li *ngFor="let r of s.recentQueries" [routerLink]="['/runs', r.id]">
            <span class="badge" [class]="r.status">{{ r.status }}</span>
            <span class="rq">{{ r.query }}</span>
            <span class="mono when">{{ r.createdAt | date: "MMM d, HH:mm" }}</span>
          </li>
        </ul>
      </section>
    </ng-container>
  `,
  styles: [
    `
      .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
      h2 { font-size: 20px; font-weight: 600; margin: 0; }
      button {
        border: 1px solid var(--line); background: var(--surface); color: var(--ink);
        border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer;
      }
      button:hover { border-color: var(--accent); color: var(--accent); }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
      .card {
        border: 1px solid var(--line); border-radius: 12px; background: var(--surface);
        padding: 16px; display: flex; flex-direction: column; gap: 6px;
      }
      .card .k {
        font-family: var(--mono); font-size: 11px; text-transform: uppercase;
        letter-spacing: 0.06em; color: var(--muted);
      }
      .card .v { font-size: 26px; font-weight: 600; }
      .card .v.ok { color: var(--accent); }
      .card .v.bad { color: #b03030; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
      .panel { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 18px; }
      .panel h3 { font-size: 13px; margin: 0 0 14px; font-weight: 600; }
      .bars { display: flex; flex-direction: column; gap: 8px; }
      .bar-row { display: grid; grid-template-columns: 90px 1fr 34px; align-items: center; gap: 10px; }
      .bar-label { font-size: 12px; color: var(--muted); }
      .bar-track { background: #f0f0ec; border-radius: 999px; height: 10px; overflow: hidden; }
      .bar-fill { height: 100%; background: var(--observe); border-radius: 999px; min-width: 2px; }
      .bar-fill.tool { background: var(--tool); }
      .bar-val { font-family: var(--mono); font-size: 12px; text-align: right; color: var(--muted); }
      .recent { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
      .recent li {
        display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 12px;
        padding: 10px 0; border-bottom: 1px solid var(--line); cursor: pointer;
      }
      .recent li:last-child { border-bottom: none; }
      .recent li:hover .rq { color: var(--accent); }
      .rq { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mono { font-family: var(--mono); }
      .when { font-size: 12px; color: var(--muted); }
      .badge {
        font-family: var(--mono); font-size: 10px; padding: 2px 8px; border-radius: 999px;
        text-transform: uppercase; letter-spacing: 0.04em; text-align: center;
      }
      .badge.completed { background: #e5f2ee; color: var(--accent); }
      .badge.running { background: #fdf1de; color: var(--tool); }
      .badge.failed { background: #f6e3e3; color: #b03030; }
      .empty { color: var(--muted); font-size: 14px; padding: 12px 0; }
      .empty.small { padding: 4px 0; font-size: 13px; }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  stats?: Stats;
  error = "";

  constructor(private svc: RunsService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.error = "";
    this.svc.stats().subscribe({
      next: (s) => (this.stats = s),
      error: () => (this.error = "Could not load stats. Is the backend running?"),
    });
  }

  maxDay(s: Stats): number {
    return Math.max(1, ...s.byDay.map((d) => d.count));
  }
  maxTool(s: Stats): number {
    return Math.max(1, ...s.toolUsage.map((t) => t.count));
  }
  pct(n: number, max: number): number {
    return Math.round((n / max) * 100);
  }
}
