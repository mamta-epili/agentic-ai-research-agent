// LLM abstraction. The agent loop only needs "given messages, return text".
// Two providers ship here: Gemini (real) and a deterministic mock (no key needed).

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface LLMProvider {
  name: string;
  model: string;
  complete(system: string, messages: ChatMessage[]): Promise<string>;
}

// ---- Gemini ----------------------------------------------------------------

class GeminiProvider implements LLMProvider {
  name = "gemini";
  constructor(
    private apiKey: string,
    public model: string,
  ) {}

  async complete(system: string, messages: ChatMessage[]): Promise<string> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    if (!text) throw new Error("Gemini returned an empty response.");
    return text;
  }
}

// ---- Mock ------------------------------------------------------------------
// Enough logic to exercise the full agent loop offline: it searches, does a
// quick calculation if the query contains digits, then answers.

class MockProvider implements LLMProvider {
  name = "mock";
  model = "mock-react-v1";

  async complete(_system: string, messages: ChatMessage[]): Promise<string> {
    const userTurn = messages.find((m) => m.role === "user")?.text ?? "";
    const query = userTurn.replace(/^User query:\s*/i, "").trim();
    const transcript = messages.map((m) => m.text).join("\n");

    const searched = /"tool":\s*"web_search"/.test(transcript);
    const mathExpr = query.match(/[\d.]+\s*[-+*/]\s*[\d.]+/)?.[0];
    const calculated = /"tool":\s*"calculator"/.test(transcript);

    if (!searched) {
      return JSON.stringify({
        thought: `I'll look up background on "${query}" before answering.`,
        tool: "web_search",
        args: { query },
      });
    }
    if (mathExpr && !calculated) {
      return JSON.stringify({
        thought: "The question includes arithmetic; I'll compute it.",
        tool: "calculator",
        args: { expression: mathExpr },
      });
    }
    return JSON.stringify({
      thought: "I have enough context to answer.",
      final:
        `Here's a synthesized answer to "${query}" based on the demo corpus. ` +
        `(Running on the mock provider — set LLM_PROVIDER=gemini for real reasoning.)`,
    });
  }
}

// ---- Factory ---------------------------------------------------------------

export function makeProvider(): LLMProvider {
  const which = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
  if (which === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "LLM_PROVIDER=gemini but GEMINI_API_KEY is not set. Add it to your .env file.",
      );
    }
    const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    return new GeminiProvider(key, model);
  }
  return new MockProvider();
}
