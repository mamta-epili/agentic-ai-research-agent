/**
 * Demo UI. Owns presentation only — the agent it drives is the real one,
 * imported from the bundle built by demo/build.mjs.
 */
import { runAgent, tools, DEMO_CORPUS, DEMO_TOOLS } from './agent.bundle.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Presets are chosen to match what the mock provider actually branches on, not
 * what would read well. It calls web_search first, then calculator only if the
 * query contains a literal arithmetic expression — `240 * 0.24` triggers it,
 * "times 240" does not.
 */
const PRESETS = [
  { q: 'How does tidal range power compare to offshore wind?', why: 'searches, then answers' },
  { q: 'A 500 MW barrage at 24% capacity factor: what is 500 * 0.24?', why: 'searches, then calls the calculator' },
  { q: 'Why are tidal lagoons less disruptive than barrages?', why: 'two tools not needed — answers from one search' },
];

let running = false;

// ── static panels ─────────────────────────────────────────────────────────
function renderFacts() {
  const items = [
    [DEMO_CORPUS.length, 'corpus documents'],
    [DEMO_TOOLS.filter((t) => t.enabled).length, 'tools enabled'],
    [tools.length, 'tools implemented'],
    ['mock', 'provider — no key'],
  ];
  for (const [value, label] of items) {
    const li = el('li');
    li.append(el('b', null, String(value)), document.createTextNode(` ${label}`));
    $('facts').append(li);
  }
}

function renderCorpus() {
  const host = $('corpus');
  for (const doc of DEMO_CORPUS) {
    const box = el('div', 'kdoc');
    box.append(el('b', null, doc.title), el('i', null, doc.tags.join(' · ')), el('p', null, doc.snippet));
    host.append(box);
  }
}

function renderTools() {
  const host = $('tools');
  for (const tool of tools) {
    const config = DEMO_TOOLS.find((t) => t.name === tool.name);
    const row = el('div', 'tool');
    row.append(
      el('b', null, tool.name),
      el('span', null, config?.enabled === false ? '(disabled)' : tool.description),
    );
    host.append(row);
  }
  const note = el('p', 'empty', 'Tool toggles come from the same store the admin panel writes to; here they are read-only.');
  note.style.marginTop = '10px';
  host.append(note);
}

function renderPresets() {
  const host = $('presets');
  for (const preset of PRESETS) {
    const button = el('button', `preset${preset.empty ? ' preset--empty' : ''}`);
    button.type = 'button';
    button.append(document.createTextNode(preset.q), el('span'));
    button.lastChild.textContent = ` — ${preset.why}`;
    button.lastChild.style.color = 'var(--faint)';
    button.addEventListener('click', () => { $('q').value = preset.q; void run(preset.q); });
    host.append(button);
  }
}

// ── the run ───────────────────────────────────────────────────────────────
const LABEL = {
  thought: 'thought',
  tool_call: 'tool call',
  observation: 'observation',
  final: 'answer',
  error: 'error',
};

function renderStep(step) {
  const li = el('li', `step step--${step.kind}`);
  const key = el('p', 'step__k');
  key.textContent = LABEL[step.kind] ?? step.kind;
  if (step.tool) {
    key.append(document.createTextNode(' · '));
    key.append(el('em', null, step.tool));
  }
  li.append(key);

  let body = step.content;
  if (step.kind === 'tool_call') {
    try { body = JSON.stringify(JSON.parse(step.content), null, 1); } catch { /* leave raw */ }
  }
  li.append(el('p', 'step__b', body));
  $('trace').append(li);
}

function setBusy(busy) {
  running = busy;
  $('go').disabled = busy;
  $('go').textContent = busy ? 'Running' : 'Run';
  for (const button of document.querySelectorAll('.preset')) button.disabled = busy;
}

async function run(query) {
  const text = String(query ?? '').trim();
  if (!text || running) return;
  setBusy(true);

  $('trace').replaceChildren();
  $('meta').replaceChildren();

  const started = performance.now();
  const agentRun = {
    id: crypto.randomUUID(),
    query: text,
    status: 'running',
    steps: [],
    provider: '',
    model: '',
    createdAt: new Date().toISOString(),
  };

  try {
    // The loop emits each step as it happens; yielding to the event loop lets
    // the browser paint between steps so the trace reads as it builds.
    const finished = await runAgent(agentRun, {
      onStep: (step) => {
        renderStep(step);
        return new Promise((resolve) => requestAnimationFrame(resolve));
      },
    });

    const meta = $('meta');
    const add = (label, value) => {
      const span = el('span');
      span.append(document.createTextNode(`${label} `), el('b', null, String(value)));
      meta.append(span);
    };
    add('provider', finished.provider);
    add('model', finished.model);
    add('steps', finished.steps.length);
    add('status', finished.status);
    add('elapsed', `${Math.round(performance.now() - started)}ms`);

    if (finished.sources?.length) {
      const li = el('li', 'step step--observation');
      li.append(el('p', 'step__k', `sources · ${finished.sources.length} document(s) behind the search`));
      const list = el('p', 'step__b', finished.sources.map((s) => `• ${s.title}`).join('\n'));
      li.append(list);
      $('trace').append(li);
    }
  } catch (error) {
    const li = el('li', 'step step--error');
    li.append(el('p', 'step__k', 'error'), el('p', 'step__b', error.message ?? String(error)));
    $('trace').append(li);
  } finally {
    setBusy(false);
  }
}

$('ask').addEventListener('submit', (event) => {
  event.preventDefault();
  void run($('q').value);
});

renderFacts();
renderCorpus();
renderTools();
renderPresets();
