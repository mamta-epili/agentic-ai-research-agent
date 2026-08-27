import { Routes } from "@angular/router";
import { DashboardComponent } from "./dashboard.component";
import { RunsListComponent } from "./runs-list.component";
import { RunDetailComponent } from "./run-detail.component";
import { CorpusComponent } from "./corpus.component";
import { LoginComponent } from "./login.component";
import { authGuard } from "./auth.guard";

export const routes: Routes = [
  { path: "login", component: LoginComponent },
  { path: "", component: DashboardComponent, canActivate: [authGuard] },
  { path: "runs", component: RunsListComponent, canActivate: [authGuard] },
  { path: "runs/:id", component: RunDetailComponent, canActivate: [authGuard] },
  { path: "corpus", component: CorpusComponent, canActivate: [authGuard] },
  { path: "**", redirectTo: "" },
];
