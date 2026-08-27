import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "./auth.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login">
      <p class="eyebrow">Agentic AI · admin</p>
      <h2>Sign in</h2>
      <p class="hint">Enter the admin key to view runs and manage the agent.</p>

      <form (ngSubmit)="submit()">
        <input
          type="password"
          [(ngModel)]="key"
          name="key"
          placeholder="Admin key"
          autofocus
          [disabled]="loading"
        />
        <button type="submit" [disabled]="loading || !key">
          {{ loading ? "Checking…" : "Enter" }}
        </button>
      </form>

      <p class="error" *ngIf="error">{{ error }}</p>
    </div>
  `,
  styles: [
    `
      .login { max-width: 380px; margin: 80px auto 0; }
      .eyebrow {
        font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--accent); margin: 0 0 6px;
      }
      h2 { font-size: 24px; font-weight: 600; margin: 0 0 6px; }
      .hint { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
      form { display: flex; gap: 10px; }
      input {
        flex: 1; border: 1px solid var(--line); border-radius: 8px;
        padding: 10px 12px; font-size: 14px; font-family: var(--mono);
      }
      input:focus { outline: none; border-color: var(--accent); }
      button {
        border: none; background: var(--accent); color: #fff; border-radius: 8px;
        padding: 10px 18px; font-size: 14px; cursor: pointer;
      }
      button:disabled { opacity: 0.5; cursor: default; }
      .error { color: #b03030; font-size: 13px; margin-top: 12px; }
    `,
  ],
})
export class LoginComponent {
  key = "";
  loading = false;
  error = "";

  constructor(private auth: AuthService, private router: Router) {}

  submit() {
    if (!this.key) return;
    this.loading = true;
    this.error = "";
    this.auth.setKey(this.key.trim());
    this.auth.verify().subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(["/"]);
      },
      error: (err) => {
        this.loading = false;
        this.auth.clear();
        this.error =
          err?.status === 401
            ? "Invalid admin key."
            : "Could not reach the backend on localhost:4000.";
      },
    });
  }
}
