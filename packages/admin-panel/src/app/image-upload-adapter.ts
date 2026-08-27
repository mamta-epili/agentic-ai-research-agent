import { API } from "./runs.service";

// A CKEditor upload adapter that sends inserted images to the backend
// (/api/uploads), which stores them in Supabase Storage (or local disk in json
// mode) and returns a public URL. The URL — not base64 — goes into the document.

class UploadAdapter {
  constructor(private loader: any) {}

  upload(): Promise<{ default: string }> {
    return this.loader.file.then(
      (file: File) =>
        new Promise<{ default: string }>((resolve, reject) => {
          const form = new FormData();
          form.append("file", file);
          const key =
            typeof localStorage !== "undefined" ? localStorage.getItem("admin_key") : null;
          const headers: Record<string, string> = {};
          if (key) headers["x-admin-key"] = key;

          fetch(`${API}/api/uploads`, { method: "POST", headers, body: form })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Upload failed (${r.status})`))))
            .then((data: { url: string }) => resolve({ default: data.url }))
            .catch(reject);
        }),
    );
  }

  abort(): void {
    // no-op: the fetch above isn't cancellable here
  }
}

// CKEditor plugin function: register our adapter with the FileRepository.
export function UploadAdapterPlugin(editor: any): void {
  editor.plugins.get("FileRepository").createUploadAdapter = (loader: any) =>
    new UploadAdapter(loader);
}
