import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { API } from "./runs.service";

const STORAGE_KEY = "admin_key";

@Injectable({ providedIn: "root" })
export class AuthService {
  private key: string | null =
    typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

  getKey(): string | null {
    return this.key;
  }

  hasKey(): boolean {
    return !!this.key;
  }

  setKey(key: string): void {
    this.key = key;
    localStorage.setItem(STORAGE_KEY, key);
  }

  clear(): void {
    this.key = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  // Hitting a protected endpoint validates the key (the interceptor attaches it).
  verify(): Observable<{ ok: boolean }> {
    return this.http.get<{ ok: boolean }>(`${API}/api/admin/verify`);
  }

  constructor(private http: HttpClient) {}
}
