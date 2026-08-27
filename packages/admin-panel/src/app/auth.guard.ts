import { CanActivateFn, Router } from "@angular/router";
import { inject } from "@angular/core";
import { AuthService } from "./auth.service";

// Requires an admin key to be present; otherwise redirect to the login screen.
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.hasKey()) return true;
  router.navigate(["/login"]);
  return false;
};
