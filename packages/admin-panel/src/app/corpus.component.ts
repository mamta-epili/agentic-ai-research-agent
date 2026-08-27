import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { CKEditorModule } from "@ckeditor/ckeditor5-angular";
import {
  ClassicEditor,
  Essentials,
  Paragraph,
  Heading,
  Bold,
  Italic,
  Underline,
  Link,
  List,
  BlockQuote,
  Table,
  TableToolbar,
  Image,
  ImageToolbar,
  ImageInsert,
  ImageUpload,
  ImageResize,
  PasteFromOffice,
} from "ckeditor5";
import { RunsService, CorpusDoc, ToolConfig } from "./runs.service";
import { UploadAdapterPlugin } from "./image-upload-adapter";

@Component({
  selector: "app-corpus",
  standalone: true,
  imports: [CommonModule, FormsModule, CKEditorModule],
  template: `
    <h2>Knowledge &amp; tools</h2>
    <p class="empty err" *ngIf="error">{{ error }}</p>

    <section class="panel">
      <h3>Tools</h3>
      <p class="sub">Toggle which tools the agent may call.</p>
      <div class="tool" *ngFor="let t of tools">
        <label class="switch">
          <input type="checkbox" [checked]="t.enabled" (change)="toggleTool(t)" />
          <span class="slider"></span>
        </label>
        <div class="tool-info">
          <span class="mono name">{{ t.name }}</span>
          <span class="desc">{{ t.description }}</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h3>Search corpus</h3>
          <p class="sub">Documents the <code>web_search</code> tool draws from.</p>
        </div>
        <button (click)="startAdd()" *ngIf="!adding && editingId === null">+ Add document</button>
      </div>

      <div class="editor-card" *ngIf="adding || editingId !== null">
        <input class="title-input" [(ngModel)]="draftTitle" placeholder="Document title" />

        <div class="editor-tools">
          <label class="upload" [class.busy]="uploading">
            <input
              type="file"
              accept=".pdf,image/*,.txt,.md"
              (change)="onFile($event)"
              hidden
              [disabled]="uploading"
            />
            {{ uploading ? "Extracting text…" : "⬆ Upload PDF / image (extract text)" }}
          </label>
          <span class="upload-hint">PDF &amp; text extract instantly; images need OCR enabled on the server.</span>
        </div>

        <ckeditor [editor]="Editor" [config]="editorConfig" [(ngModel)]="draftHtml"></ckeditor>

        <input class="tags-input" [(ngModel)]="draftTags" placeholder="Tags (comma separated)" />

        <div class="editor-actions">
          <button class="primary" (click)="save()" [disabled]="!draftTitle || saving">
            {{ saving ? "Saving…" : "Save document" }}
          </button>
          <button (click)="cancel()">Cancel</button>
        </div>
      </div>

      <p class="empty" *ngIf="!docs.length && !error && !adding">No documents yet.</p>

      <div class="doc" *ngFor="let d of docs" [class.disabled]="!d.enabled">
        <div class="doc-main" *ngIf="editingId !== d.id">
          <div class="doc-title-row">
            <span class="doc-title">{{ d.title }}</span>
            <span class="tags"><span class="tag" *ngFor="let t of d.tags">{{ t }}</span></span>
          </div>
          <div class="doc-body rich" *ngIf="d.contentHtml" [innerHTML]="safe(d.contentHtml)"></div>
          <p class="doc-body" *ngIf="!d.contentHtml">{{ d.snippet }}</p>
        </div>
        <div class="doc-actions" *ngIf="editingId !== d.id">
          <label class="switch sm">
            <input type="checkbox" [checked]="d.enabled" (change)="toggleDoc(d)" />
            <span class="slider"></span>
          </label>
          <button class="mini" (click)="startEdit(d)">Edit</button>
          <button class="mini danger" (click)="removeDoc(d)">Delete</button>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      h2 { font-size: 20px; font-weight: 600; margin: 0 0 18px; }
      .panel { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 18px; margin-bottom: 16px; }
      .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
      .panel h3 { font-size: 14px; margin: 0 0 4px; font-weight: 600; }
      .sub { color: var(--muted); font-size: 13px; margin: 0 0 14px; }
      code { font-family: var(--mono); font-size: 12px; background: #f0f0ec; padding: 1px 5px; border-radius: 4px; }
      button {
        border: 1px solid var(--line); background: var(--surface); color: var(--ink);
        border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer;
      }
      button:hover { border-color: var(--accent); color: var(--accent); }
      button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
      button.primary:disabled { opacity: 0.5; cursor: default; }
      .mini { padding: 4px 10px; font-size: 12px; }
      .mini.danger:hover { border-color: #b03030; color: #b03030; }
      .tool { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--line); }
      .tool:last-child { border-bottom: none; }
      .tool-info { display: flex; flex-direction: column; gap: 2px; }
      .name { font-size: 13px; }
      .desc { font-size: 13px; color: var(--muted); }
      .editor-card { display: flex; flex-direction: column; gap: 12px; padding: 14px 0 4px; }
      .title-input, .tags-input {
        border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font-size: 14px; width: 100%;
      }
      .title-input { font-weight: 600; }
      .title-input:focus, .tags-input:focus { outline: none; border-color: var(--accent); }
      .editor-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .upload {
        display: inline-flex; align-items: center; gap: 6px; border: 1px dashed var(--line);
        border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; color: var(--observe);
      }
      .upload:hover { border-color: var(--observe); }
      .upload.busy { opacity: 0.6; cursor: default; }
      .upload-hint { font-size: 12px; color: var(--muted); }
      .editor-actions { display: flex; gap: 8px; }
      .doc { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--line); }
      .doc:last-child { border-bottom: none; }
      .doc.disabled { opacity: 0.5; }
      .doc-main { flex: 1; min-width: 0; }
      .doc-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
      .doc-title { font-weight: 600; font-size: 14.5px; }
      .doc-body { font-size: 13.5px; color: var(--muted); margin: 0; }
      .doc-body.rich { color: var(--ink); }
      .doc-body.rich { overflow-wrap: anywhere; }
      .doc-body.rich table { border-collapse: collapse; margin: 8px 0; max-width: 100%; }
      .doc-body.rich td, .doc-body.rich th { border: 1px solid var(--line); padding: 4px 8px; }
      /* CKEditor wraps images in figure.image (display:table), which ignores a
         max-width on the img alone — constrain the figure and force block flow. */
      .doc-body.rich figure { max-width: 100%; margin: 10px 0; }
      .doc-body.rich figure.image { display: block; }
      .doc-body.rich img { max-width: 100%; height: auto; border-radius: 6px; }
      .tags { display: flex; gap: 5px; flex-wrap: wrap; }
      .tag { font-family: var(--mono); font-size: 10.5px; background: #eef1f0; color: var(--observe); padding: 1px 7px; border-radius: 999px; }
      .doc-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
      .switch { position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; }
      .switch.sm { width: 34px; height: 20px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; inset: 0; background: #ccc; border-radius: 999px; transition: 0.2s; cursor: pointer; }
      .slider::before { content: ""; position: absolute; height: 16px; width: 16px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
      .switch.sm .slider::before { height: 14px; width: 14px; }
      .switch input:checked + .slider { background: var(--accent); }
      .switch input:checked + .slider::before { transform: translateX(16px); }
      .switch.sm input:checked + .slider::before { transform: translateX(14px); }
      .empty { color: var(--muted); font-size: 14px; padding: 12px 0; }
      .empty.err { color: #b03030; }
      .mono { font-family: var(--mono); }
    `,
  ],
})
export class CorpusComponent implements OnInit {
  docs: CorpusDoc[] = [];
  tools: ToolConfig[] = [];
  error = "";
  adding = false;
  editingId: string | null = null;
  saving = false;
  uploading = false;

  draftTitle = "";
  draftHtml = "";
  draftTags = "";

  Editor = ClassicEditor;
  editorConfig = {
    licenseKey: "GPL",
    plugins: [
      Essentials, Paragraph, Heading, Bold, Italic, Underline, Link, List,
      BlockQuote, Table, TableToolbar, Image, ImageToolbar, ImageInsert,
      ImageUpload, ImageResize, PasteFromOffice,
    ],
    extraPlugins: [UploadAdapterPlugin],
    toolbar: [
      "heading", "|", "bold", "italic", "underline", "link", "bulletedList",
      "numberedList", "blockQuote", "|", "insertTable", "insertImage", "|",
      "undo", "redo",
    ],
    table: { contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"] },
    image: {
      toolbar: ["imageTextAlternative", "|", "imageStyle:inline", "imageStyle:block", "imageStyle:side"],
    },
  };

  constructor(private svc: RunsService, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.loadDocs();
    this.loadTools();
  }

  safe(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  loadDocs() {
    this.svc.corpusList().subscribe({
      next: (d) => (this.docs = d),
      error: () => (this.error = "Could not load corpus. Is the backend running and migrated?"),
    });
  }

  loadTools() {
    this.svc.toolsList().subscribe({
      next: (t) => (this.tools = t),
      error: () => (this.error = "Could not load tools."),
    });
  }

  toggleTool(t: ToolConfig) {
    this.svc.toolSet(t.name, !t.enabled).subscribe({
      next: (u) => (t.enabled = u.enabled),
      error: () => (this.error = "Could not update tool."),
    });
  }

  toggleDoc(d: CorpusDoc) {
    this.svc.corpusUpdate(d.id, { enabled: !d.enabled }).subscribe({
      next: (u) => (d.enabled = u.enabled),
      error: () => (this.error = "Could not update document."),
    });
  }

  startAdd() {
    this.adding = true;
    this.editingId = null;
    this.draftTitle = "";
    this.draftHtml = "";
    this.draftTags = "";
  }

  startEdit(d: CorpusDoc) {
    this.adding = false;
    this.editingId = d.id;
    this.draftTitle = d.title;
    this.draftHtml = d.contentHtml ?? `<p>${d.snippet}</p>`;
    this.draftTags = d.tags.join(", ");
  }

  cancel() {
    this.adding = false;
    this.editingId = null;
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading = true;
    this.error = "";
    this.svc.corpusExtract(file).subscribe({
      next: (res) => {
        this.uploading = false;
        const html = this.textToHtml(res.text);
        this.draftHtml = this.draftHtml ? this.draftHtml + html : html;
        if (!this.draftTitle) this.draftTitle = res.filename.replace(/\.[^.]+$/, "");
        input.value = "";
      },
      error: () => {
        this.uploading = false;
        this.error = "Could not extract text from that file.";
        input.value = "";
      },
    });
  }

  save() {
    this.saving = true;
    const payload = {
      title: this.draftTitle,
      contentHtml: this.draftHtml,
      tags: this.parseTags(),
    };
    const done = {
      next: () => {
        this.saving = false;
        this.cancel();
        this.loadDocs();
      },
      error: () => {
        this.saving = false;
        this.error = "Could not save document.";
      },
    };
    if (this.editingId) this.svc.corpusUpdate(this.editingId, payload).subscribe(done);
    else this.svc.corpusCreate(payload).subscribe(done);
  }

  removeDoc(d: CorpusDoc) {
    if (!confirm(`Delete "${d.title}"?`)) return;
    this.svc.corpusDelete(d.id).subscribe({
      next: () => (this.docs = this.docs.filter((x) => x.id !== d.id)),
      error: () => (this.error = "Could not delete document."),
    });
  }

  private textToHtml(text: string): string {
    return text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${this.escape(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private parseTags(): string[] {
    return this.draftTags.split(",").map((t) => t.trim()).filter(Boolean);
  }
}
