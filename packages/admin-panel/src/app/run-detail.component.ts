import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { RunsService, Run } from "./runs.service";

@Component({
  selector: "app-run-detail",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a routerLink="/runs" class="back">← All runs</a>

    <ng-container *ngIf="run as r">
      <div class="head">
        <h2 class="query">{{ r.query }}</h2>
        <div class="run-actions">
          <button (click)="rerun(r)" [disabled]="busy">↻ Re-run</button>
          <button class="danger" (click)="remove(r)" [disabled]="busy">✕ Delete</button>
        </div>
      </div>
      <div class="meta">
        <span class="badge" [class]="r.status">{{ r.status }}</span>
        <span>{{ r.provider }} / {{ r.model }}</span>
        <span>{{ r.steps.length }} steps</span>
        <span *ngIf="r.durationMs != null">{{ r.durationMs }} ms</span>
        <span>{{ r.createdAt | date: "medium" }}</span>
      </div>

      <div class="trace">
        <div class="step" *ngFor="let s of r.steps" [class]="s.kind">
          <span class="tag">
            {{ label(s.kind) }}<ng-container *ngIf="s.tool"> · {{ s.tool }}</ng-container>
          </span>
          <div class="body" [class.code]="s.kind === 'tool_call'">{{ s.content }}</div>
        </div>
      </div>

      <div class="answer" *ngIf="r.answer">
        <span class="tag">final answer</span>
        <div class="body">{{ r.answer }}</div>
      </div>
    </ng-container>

    <p class="empty" *ngIf="error">{{ error }}</p>
  `,
  styles: [
    `
      .back { font-size: 13px; font-family: var(--mono); }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 16px 0 8px; }
      .run-actions { display: flex; gap: 8px; flex-shrink: 0; }
      .run-actions button {
        border: 1px solid var(--line); background: var(--surface); color: var(--ink);
        border-radius: 8px; padding: 7px 12px; font-size: 13px; cursor: pointer;
      }
      .run-actions button:hover { border-color: var(--accent); color: var(--accent); }
      .run-actions button.danger:hover { border-color: #b03030; color: #b03030; }
      .run-actions button:disabled { opacity: 0.5; cursor: default; }
      .query { font-size: 20px; font-weight: 600; margin: 0; }
      .meta {
        display: flex; flex-wrap: wrap; gap: 14px; font-family: var(--mono);
        font-size: 12px; color: var(--muted); margin-bottom: 24px;
      }
      .badge {
        font-size: 11px; padding: 2px 8px; border-radius: 999px;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .badge.completed { background: #e5f2ee; color: var(--accent); }
      .badge.running { background: #fdf1de; color: var(--tool); }
      .badge.failed { background: #f6e3e3; color: #b03030; }
      .trace { display: flex; flex-direction: column; gap: 10px; }
      .step {
        border: 1px solid var(--line); border-left: 3px solid var(--line);
        border-radius: 10px; background: var(--surface); padding: 12px 14px;
      }
      .step .tag {
        font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
        text-transform: uppercase; display: inline-block; margin-bottom: 6px;
      }
      .step .body { font-size: 14.5px; white-space: pre-wrap; word-break: break-word; }
      .step .body.code { font-family: var(--mono); font-size: 13px; color: var(--muted); }
      .step.thought { border-left-color: var(--accent); }
      .step.thought .tag { color: var(--accent); }
      .step.tool_call { border-left-color: var(--tool); }
      .step.tool_call .tag { color: var(--tool); }
      .step.observation { border-left-color: var(--observe); }
      .step.observation .tag { color: var(--observe); }
      .step.error { border-left-color: #b03030; }
      .step.error .tag { color: #b03030; }
      .answer {
        margin-top: 20px; padding: 18px 20px; border: 1px solid var(--accent);
        border-radius: 10px; background: #f2f8f6;
      }
      .answer .tag {
        font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
        text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 8px;
      }
      .answer .body { font-size: 15.5px; white-space: pre-wrap; }
      .empty { color: var(--muted); font-size: 14px; padding: 20px 0; }
    `,
  ],
})
export class RunDetailComponent implements OnInit {
  run?: Run;
  error = "";
  busy = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private svc: RunsService,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get("id")!;
    this.svc.get(id).subscribe({
      next: (r) => (this.run = r),
      error: () => (this.error = "Run not found or backend unavailable."),
    });
  }

  rerun(r: Run) {
    this.busy = true;
    this.svc.rerun(r.id).subscribe({
      next: (nr) => {
        this.busy = false;
        this.router.navigate(["/runs", nr.id]).then(() => {
          this.run = nr; // update in place if already on the route
          this.ngOnInit();
        });
      },
      error: () => {
        this.busy = false;
        this.error = "Re-run failed.";
      },
    });
  }

  remove(r: Run) {
    if (!confirm(`Delete this run?\n\n"${r.query}"`)) return;
    this.busy = true;
    this.svc.remove(r.id).subscribe({
      next: () => this.router.navigate(["/runs"]),
      error: () => {
        this.busy = false;
        this.error = "Delete failed.";
      },
    });
  }

  label(kind: string): string {
    return (
      { thought: "thinking", tool_call: "tool call", observation: "observation", final: "answer", error: "error" } as Record<
        string,
        string
      >
    )[kind] ?? kind;
  }
}
