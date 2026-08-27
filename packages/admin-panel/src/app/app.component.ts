import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from "@angular/router";
import { AuthService } from "./auth.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <header>
        <div class="brand">
          <p class="eyebrow">Agentic AI · admin</p>
          <a routerLink="/" class="title">Agent console</a>
        </div>
        <nav *ngIf="auth.hasKey()">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Dashboard</a>
          <a routerLink="/runs" routerLinkActive="active">Runs</a>
          <a routerLink="/corpus" routerLinkActive="active">Knowledge &amp; tools</a>
          <button class="logout" (click)="logout()">Sign out</button>
        </nav>
      </header>
      <router-outlet></router-outlet>
    </div>
  `,
  styles: [
    `
      .shell { max-width: 1000px; margin: 0 auto; padding: 40px 24px 80px; }
      header {
        display: flex; align-items: flex-end; justify-content: space-between; gap: 20px;
        border-bottom: 1px solid var(--line); padding-bottom: 16px; margin-bottom: 28px;
      }
      .eyebrow {
        font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--accent); margin: 0 0 6px;
      }
      .title { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; display: inline-block; }
      nav { display: flex; align-items: center; gap: 4px; }
      nav a {
        font-size: 13.5px; padding: 7px 12px; border-radius: 8px; color: var(--muted);
      }
      nav a:hover { color: var(--ink); }
      nav a.active { color: var(--accent); background: #eef4f2; }
      .logout {
        margin-left: 8px; border: 1px solid var(--line); background: var(--surface);
        color: var(--muted); border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer;
      }
      .logout:hover { border-color: #b03030; color: #b03030; }
    `,
  ],
})
export class AppComponent {
  constructor(public auth: AuthService, private router: Router) {}

  logout() {
    this.auth.clear();
    this.router.navigate(["/login"]);
  }
}
