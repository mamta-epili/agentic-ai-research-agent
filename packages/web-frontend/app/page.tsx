"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AGENT_API } from "../lib/api";

type Step = {
  index: number;
  kind: "thought" | "tool_call" | "observation" | "final" | "error";
  content: string;
  tool?: string;
};

type Source = {
  id: string;
  title: string;
  contentHtml: string | null;
  snippet: string;
};

const SAMPLES = [
  "What is agentic AI, and how does the ReAct pattern relate to it?",
  "Compare Next.js and Angular for a dashboard. Also, what is 128 * 12?",
  "What time is it, and what is SSE used for?",
];

const TAGS: Record<Step["kind"], string> = {
  thought: "thinking",
  tool_call: "tool call",
  observation: "observation",
  final: "answer",
  error: "error",
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [meta, setMeta] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  function start(q: string) {
    const trimmed = q.trim();
    if (!trimmed || running) return;

    setSteps([]);
    setAnswer(null);
    setSources([]);
    setMeta(null);
    setRunning(true);
    sourceRef.current?.close();

    const url = `${AGENT_API}/api/run?query=${encodeURIComponent(trimmed)}`;
    const es = new EventSource(url);
    sourceRef.current = es;

    es.addEventListener("step", (e) => {
      const step = JSON.parse((e as MessageEvent).data) as Step;
      if (step.kind === "final") {
        setAnswer(step.content);
      } else {
        setSteps((prev) => [...prev, step]);
      }
    });

    es.addEventListener("run_finished", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setMeta(`run ${data.id.slice(0, 8)} · ${data.status} · ${data.durationMs} ms`);
      if (Array.isArray(data.sources)) setSources(data.sources as Source[]);
      setRunning(false);
      es.close();
    });

    es.addEventListener("error", () => {
      setRunning(false);
      es.close();
      setSteps((prev) => [
        ...prev,
        { index: -1, kind: "error", content: "Connection to the agent backend failed. Is it running on " + AGENT_API + "?" },
      ]);
    });
  }

  return (
    <main className="wrap">
      <header className="masthead">
        <p className="eyebrow">Agentic AI · demo</p>
        <h1>Research agent</h1>
        <p>Ask a question and watch the agent plan, call tools, and read results before it answers.</p>
      </header>

      <div className="query-form">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start(query)}
          placeholder="Ask the research agent…"
          disabled={running}
        />
        <button onClick={() => start(query)} disabled={running}>
          {running ? "Working…" : "Run"}
        </button>
      </div>

      <div className="samples">
        {SAMPLES.map((s) => (
          <button key={s} onClick={() => { setQuery(s); start(s); }} disabled={running}>
            {s}
          </button>
        ))}
      </div>

      <section className="trace">
        {steps.map((s, i) => (
          <div key={i} className={`step ${s.kind}`}>
            <span className="tag">
              {TAGS[s.kind]}
              {s.tool ? ` · ${s.tool}` : ""}
            </span>
            {s.kind === "observation" ? (
              <div className="body markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content}</ReactMarkdown>
              </div>
            ) : (
              <div className={`body ${s.kind === "tool_call" ? "code" : ""}`}>{s.content}</div>
            )}
          </div>
        ))}
      </section>

      {answer && (
        <div className="answer">
          <span className="tag">final answer</span>
          <div className="body markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
          </div>
          {meta && <div className="meta">{meta}</div>}
        </div>
      )}

      {sources.length > 0 && (
        <div className="sources">
          <span className="tag">sources</span>
          {sources.map((s) => (
            <div key={s.id} className="source">
              <div className="source-title">{s.title}</div>
              {s.contentHtml ? (
                <div
                  className="source-body rich"
                  dangerouslySetInnerHTML={{ __html: s.contentHtml }}
                />
              ) : (
                <div className="source-body">{s.snippet}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="footer-note">
        Every run is logged. View the full history in the Angular admin panel at{" "}
        <a href="http://localhost:4700">localhost:4700</a>.
      </p>
    </main>
  );
}
