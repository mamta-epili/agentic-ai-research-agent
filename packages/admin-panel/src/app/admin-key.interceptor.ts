import { HttpInterceptorFn, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, throwError } from "rxjs";
import { AuthService } from "./auth.service";
import { API } from "./runs.service";

// Attaches the admin key to backend requests and bounces to /login on 401.
export const adminKeyInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  let request = req;
  const key = auth.getKey();
  if (key && req.url.startsWith(API)) {
    request = req.clone({ setHeaders: { "x-admin-key": key } });
  }

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        auth.clear();
        router.navigate(["/login"]);
      }
      return throwError(() => err);
    }),
  );
};
