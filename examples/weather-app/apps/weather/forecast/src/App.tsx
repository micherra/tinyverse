import React, { useEffect, useMemo, useState } from "react";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Plan = { toolId: string | null; resourceUri: string | null; args: Record<string, any>; reason?: string };
type ToolResponse = { result?: { forecast?: string[] } | any; forecast?: string[]; error?: string };
type ToolMeta = {
  toolId: string;
  resourceUri: string;
  description?: string;
  schema?: Record<string, any>;
};

const TOOL_ENDPOINT = (toolId: string) => `/tools/${toolId}`;

const CodeBlock = ({ title, content }: { title: string; content: string }) => (
  <div className="code-block">
    <div className="code-head">{title}</div>
    <pre>{content}</pre>
  </div>
);

const Status = ({ label, tone }: { label: string; tone: "success" | "error" | "muted" | "info" }) => (
  <span className={`status ${tone}`}>{label}</span>
);

const forecastCards = (data: ToolResponse) => {
  const list = data.result?.forecast ?? data.forecast;
  if (!Array.isArray(list)) return null;
  return (
    <div className="forecast-grid">
      {list.map((entry: string, idx: number) => (
        <div key={`${entry}-${idx}`} className="forecast-card">
          <div className="forecast-day">Day {idx + 1}</div>
          <div className="forecast-text">{entry}</div>
          <div className="forecast-meta">Source: weather.getForecast</div>
        </div>
      ))}
    </div>
  );
};

const getEnvApiKey = () => {
  // Try Vite env (with OPENAI_ prefix), then process.env, then a window override.
  const env = (import.meta as any).env ?? {};
  const viteKey = env.VITE_OPENAI_API_KEY;
  const openAiKey = env.OPENAI_API_KEY;
  const processKey = typeof process !== "undefined" ? (process as any)?.env?.OPENAI_API_KEY : undefined;
  const windowKey = typeof window !== "undefined" ? (window as any)?.OPENAI_API_KEY : undefined;
  return (viteKey || openAiKey || processKey || windowKey || "").trim();
};

const isWeatherQuery = (text: string) => {
  const normalized = text.toLowerCase();
  return /(weather|forecast|temperature|rain|snow|sunny|cloudy|precip|wind)/.test(normalized);
};

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState(() => getEnvApiKey() || localStorage.getItem("tv_preview_api_key") || "");
  const [userInput, setUserInput] = useState("What's the 4-day forecast for San Francisco?");
  const [messages, setMessages] = useState<Message[]>([
    { id: "m-1", role: "assistant", content: "Ask me about weather and I'll pick the right tool + UI." },
  ]);
  const [availableTools, setAvailableTools] = useState<ToolMeta[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [toolResponse, setToolResponse] = useState<ToolResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "planning" | "calling" | "done" | "error">("idle");
  const [error, setError] = useState<string>("");
  const hasApiKey = Boolean(apiKey);
  const resourceHref = useMemo(() => {
    if (!plan?.resourceUri) return null;
    const match = /^ui:\/\/([^/]+)\/(.+)$/.exec(plan.resourceUri);
    if (!match) return null;
    const [, ns, res] = match;
    return `${window.location.origin}/ui/${ns}/${res}`;
  }, [plan]);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("tv_preview_api_key", apiKey);
    }
  }, [apiKey]);

  useEffect(() => {
    const loadTools = async () => {
      try {
        setCatalogError(null);
        const res = await fetch("/tools");
        if (!res.ok) throw new Error(`Tool list failed: ${res.status}`);
        const data = (await res.json()) as any[];
        const mapped: ToolMeta[] =
          data?.map((entry) => ({
            toolId: entry.id ?? entry.toolId ?? "unknown.tool",
            resourceUri: entry.resourceUri ?? "ui://weather/forecast",
            description: entry.description,
            schema: entry.inputSchema,
          })) ?? [];
        setAvailableTools(mapped.length > 0 ? mapped : []);
      } catch (err) {
        setCatalogError(err instanceof Error ? err.message : "Failed to load tool catalog");
        // fallback to weather tool
        setAvailableTools([
          {
            toolId: "weather.getForecast",
            resourceUri: "ui://weather/forecast",
            description: "Get a mock forecast for a location and optional number of days",
            schema: {
              type: "object",
              properties: { location: { type: "string" }, days: { type: "integer", minimum: 1 } },
              required: ["location"],
            },
          },
        ]);
      }
    };
    void loadTools();
  }, []);

  const planWithOpenAI = async (question: string): Promise<Plan> => {
    if (!apiKey) {
      throw new Error("Add an OpenAI API key to plan the tool call.");
    }

    const toolCatalog = availableTools.map((t) => ({
      toolId: t.toolId,
      resourceUri: t.resourceUri,
      description: t.description,
      schema: t.schema,
    }));

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a routing assistant. Pick the best tool and args based on the user request. Respond as JSON only. If no tool fits, return toolId=null and explain briefly.",
          },
          {
            role: "user",
            content: [
              "Available tools:",
              JSON.stringify(toolCatalog, null, 2),
              'Respond with {"toolId": string|null, "resourceUri": string|null, "args": object, "reason"?: string}.',
              "Ensure args match the schema. If no tool fits, set toolId/resourceUri to null and include a reason.",
              `User question: ${question}`,
            ].join("\n"),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ToolPlan",
            schema: {
              type: "object",
              properties: {
                toolId: { type: ["string", "null"] },
                resourceUri: { type: ["string", "null"] },
                args: { type: "object" },
                reason: { type: "string" },
              },
              required: ["toolId", "resourceUri", "args"],
              additionalProperties: true,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI call failed: ${message || response.statusText}`);
    }

    const body = await response.json();
    const parsed = body.choices?.[0]?.message?.content;
    const planJson = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    const matched = planJson?.toolId ? availableTools.find((t) => t.toolId === planJson.toolId) : null;
    return {
      toolId: matched ? matched.toolId : planJson?.toolId ?? null,
      resourceUri: matched ? matched.resourceUri : planJson?.resourceUri ?? null,
      args: planJson?.args ?? {},
      reason: planJson?.reason,
    };
  };

  const callTool = async (nextPlan: Plan): Promise<ToolResponse> => {
    const res = await fetch(TOOL_ENDPOINT(nextPlan.toolId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextPlan.args ?? {}),
    });
    const data = (await res.json().catch(() => ({}))) as ToolResponse;
    if (!res.ok || data.error) {
      throw new Error(data.error || `Tool returned ${res.status}`);
    }
    return data;
  };

  const handleSend = async () => {
    if (!userInput.trim()) return;
    setStatus("planning");
    setError("");
    setToolResponse(null);

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: userInput };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const nextPlan = await planWithOpenAI(userInput);
      setPlan(nextPlan);
      const weatherish = isWeatherQuery(userInput);
      if (!nextPlan.toolId || !nextPlan.resourceUri || !weatherish) {
        const reason = !weatherish
          ? "Question is not weather-related."
          : nextPlan.reason ?? "No relevant tool found for this request.";
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: `No tool chosen: ${reason}` },
        ]);
        setStatus("done");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Using ${nextPlan.toolId} (${nextPlan.resourceUri}) with args ${JSON.stringify(nextPlan.args)}`,
        },
      ]);
      setStatus("calling");
      const data = await callTool(nextPlan);
      setToolResponse(data);
      setStatus("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview failed";
      setError(message);
      setStatus("error");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${message}` },
      ]);
    }
  };

  return (
    <div className="preview-page">
      <header className="hero">
        <div className="pill">Tinyverse Preview</div>
        <h1>Chat-driven weather preview</h1>
        <p>
          The chat calls OpenAI (with your key) to pick a tool and args, then invokes the Tinyverse tool endpoint and
          renders the response.
        </p>
        <div className="api-key-row">
          <label>
            OpenAI API Key
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              aria-label="OpenAI API Key"
            />
          </label>
          <Status
            label={hasApiKey ? "Key set (stored locally or from env)" : "Add an API key to plan tool calls"}
            tone={hasApiKey ? "success" : "info"}
          />
        </div>
        {!hasApiKey ? <div className="warning">No API key detected. Set VITE_OPENAI_API_KEY/OPENAI_API_KEY or paste one above.</div> : null}
        {catalogError ? <div className="warning">Tool catalog load failed: {catalogError}</div> : null}
      </header>

      <main className="grid">
        <section className="panel chat-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Chat</p>
              <h2>Ask for a forecast</h2>
              <p>The planner picks a tool + args; the dev server handles the call.</p>
            </div>
          </div>

          <div className="chat-feed">
            {messages.map((msg) => (
              <div key={msg.id} className={`bubble ${msg.role}`}>
                <div className="bubble-role">{msg.role === "assistant" ? "Assistant" : "You"}</div>
                <div className="bubble-text">{msg.content}</div>
              </div>
            ))}
          </div>

          <div className="composer">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              rows={3}
              placeholder="Ask for a forecast, e.g. What's the 4-day outlook for Seattle?"
            />
            <div className="actions">
              <button
                type="button"
                onClick={handleSend}
                disabled={status === "planning" || status === "calling" || !hasApiKey || availableTools.length === 0}
              >
                {status === "planning" ? "Planning…" : status === "calling" ? "Calling tool…" : "Send"}
              </button>
              {status === "done" ? <Status label="Done" tone="success" /> : null}
              {status === "error" ? <Status label="Error" tone="error" /> : null}
              {status === "idle" ? <Status label="Idle" tone="muted" /> : null}
              {status === "planning" ? <Status label="Planning" tone="info" /> : null}
              {status === "calling" ? <Status label="Calling tool" tone="info" /> : null}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <p className="eyebrow">Structured plan</p>
            <h2>Planned tool call</h2>
            <p>Planner output (tool + args).</p>
          </div>
          {plan ? (
            <CodeBlock title="plan" content={JSON.stringify(plan, null, 2)} />
          ) : (
            <div className="placeholder">No plan yet — send a request.</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <p className="eyebrow">Tool response</p>
            <h2>Structured result</h2>
            <p>Result returned from the dev server tool endpoint.</p>
          </div>
          {error ? <div className="error-box">{error}</div> : null}
          {toolResponse ? (
            <>
              <CodeBlock title="result" content={JSON.stringify(toolResponse, null, 2)} />
              {forecastCards(toolResponse)}
            </>
          ) : (
            <div className="placeholder">Awaiting tool call…</div>
          )}
        </section>

      </main>
    </div>
  );
};

export default App;
