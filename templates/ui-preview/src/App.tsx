import React, { useEffect, useMemo, useState } from "react";

// Fallbacks that will be overwritten by the CLI preview command.
const FALLBACK_TOOL_ID = "demo.toolId";
const FALLBACK_RESOURCE_URI = "ui://demo/preview";
const SHELL_RESOURCE_URI = "ui://tinyverse/preview";

const getEnvApiKey = () => {
  const env = (import.meta as any).env ?? {};
  const viteKey = env.VITE_OPENAI_API_KEY;
  const openAiKey = env.OPENAI_API_KEY;
  const processKey = typeof process !== "undefined" ? (process as any)?.env?.OPENAI_API_KEY : undefined;
  const windowKey = typeof window !== "undefined" ? (window as any)?.OPENAI_API_KEY : undefined;
  return (viteKey || openAiKey || processKey || windowKey || "").trim();
};

type Message = { id: string; role: "user" | "assistant"; content: string; data?: any; plan?: Plan };
type Plan = { toolId: string; resourceUri: string; args: Record<string, any> };
type ToolResponse = { result?: any; error?: string; [key: string]: any };
type ToolMeta = {
  toolId: string;
  resourceUri?: string;
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

const MessageText: React.FC<{ content: string }> = ({ content }) => {
  const parts = content.split(/(\`\`\`[a-z]*\n[\s\S]*?\n\`\`\`|\*\*[^*]+\*\*)/);
  return (
    <div className="bubble-text">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.split("\n");
          const code = lines.slice(1, -1).join("\n");
          return (
            <pre key={i} className="message-pre">
              {code}
            </pre>
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
};

const ToolIframe = ({ plan, data }: { plan: Plan; data: any }) => {
  return null;
};

const StructuredPlan = ({ plan }: { plan: Plan }) => {
  const [viewMode, setViewMode] = useState<"ui" | "json">("ui");

  return (
    <div className="structured-plan-container" style={{ marginTop: "12px" }}>
      <div className="panel-head" style={{ marginBottom: "12px" }}>
        <div>
          <p className="eyebrow">Structured plan</p>
          <h2 style={{ margin: 0, fontSize: "18px", color: "inherit" }}>
            {viewMode === "ui" ? "Plan summary" : "Planned tool call"}
          </h2>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>
            {viewMode === "ui" ? "Summary of the selected tool and args." : "Planner output (tool + args)."}
          </p>
        </div>
        <div className="tabs">
          <button
            type="button"
            className={`tab-btn ${viewMode === "ui" ? "active" : ""}`}
            onClick={() => setViewMode("ui")}
          >
            UI
          </button>
          <button
            type="button"
            className={`tab-btn ${viewMode === "json" ? "active" : ""}`}
            onClick={() => setViewMode("json")}
          >
            JSON
          </button>
        </div>
      </div>

      {viewMode === "json" ? (
        <CodeBlock title="plan" content={JSON.stringify(plan, null, 2)} />
      ) : (
        <div className="plan-ui-summary" style={{ padding: "12px", background: "#f8fafc", borderRadius: "10px" }}>
          <p style={{ margin: "0 0 8px" }}>
            Tool: <strong>{plan.toolId}</strong>
          </p>
          <p style={{ margin: 0 }}>Arguments:</p>
          <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
            {Object.entries(plan.args).map(([key, val]) => (
              <li key={key}>
                <code>{key}</code>: {typeof val === "object" ? JSON.stringify(val) : String(val)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const ToolResponseCard = ({
  plan,
  data,
}: {
  plan: Plan;
  data: any;
}) => {
  const [viewMode, setViewMode] = useState<"ui" | "json">("ui");
  const hasUi = !!(plan.resourceUri && plan.resourceUri !== SHELL_RESOURCE_URI);

  const resourceHref = useMemo(() => {
    if (!plan.resourceUri || plan.resourceUri === SHELL_RESOURCE_URI) return null;
    const match = /^ui:\/\/([^/]+)\/(.+)$/.exec(plan.resourceUri);
    if (!match) return null;
    const [, ns, res] = match;
    return `${window.location.origin}/ui/${ns}/${res}`;
  }, [plan]);

  return (
    <div className="tool-response-container" style={{ marginTop: "12px" }}>
      <div className="panel-head" style={{ marginBottom: "12px" }}>
        <div>
          <p className="eyebrow">Tool response</p>
          <h2 style={{ margin: 0, fontSize: "18px", color: "inherit" }}>
            {viewMode === "ui" ? "Tool UI" : "Structured result"}
          </h2>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>
            {viewMode === "ui"
              ? "Interactive UI mapped to this tool."
              : "Result returned from the dev server tool endpoint."}
          </p>
        </div>
        {hasUi && resourceHref && (
          <div className="tabs">
            <button
              type="button"
              className={`tab-btn ${viewMode === "ui" ? "active" : ""}`}
              onClick={() => setViewMode("ui")}
            >
              UI
            </button>
            <button
              type="button"
              className={`tab-btn ${viewMode === "json" ? "active" : ""}`}
              onClick={() => setViewMode("json")}
            >
              JSON
            </button>
          </div>
        )}
      </div>

      {viewMode === "json" || !hasUi || !resourceHref ? (
        <CodeBlock title="result" content={JSON.stringify(data, null, 2)} />
      ) : (
        <div className="embedded-ui-container">
          <iframe
            className="resource-frame embedded"
            src={resourceHref}
            onLoad={(e) => {
              e.currentTarget.contentWindow?.postMessage(
                {
                  type: "tinyverse:toolResponse",
                  data: data,
                  toolId: plan.toolId,
                  resourceUri: plan.resourceUri,
                },
                "*",
              );
            }}
          />
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState(() => getEnvApiKey() || localStorage.getItem("tv_preview_api_key") || "");
  const [userInput, setUserInput] = useState("What's the forecast for San Francisco?");
  const [messages, setMessages] = useState<Message[]>([
    { id: "m-1", role: "assistant", content: "Ask a question; I'll plan the tool call and show you the result." },
  ]);
  const [availableTools, setAvailableTools] = useState<ToolMeta[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "planning" | "calling" | "done" | "error">("idle");
  const [error, setError] = useState<string>("");
  const hasApiKey = Boolean(apiKey);

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
            resourceUri: entry.resourceUri,
            description: entry.description,
            schema: entry.inputSchema,
          })) ?? [];
        const withFallback =
          mapped.length > 0
            ? mapped
            : [
                {
                  toolId: FALLBACK_TOOL_ID,
                  resourceUri: FALLBACK_RESOURCE_URI,
                  description: "Fallback preview tool",
                },
              ];
        setAvailableTools(withFallback);
      } catch (err) {
        setCatalogError(err instanceof Error ? err.message : "Failed to load tool catalog");
        setAvailableTools([
          {
            toolId: FALLBACK_TOOL_ID,
            resourceUri: FALLBACK_RESOURCE_URI,
            description: "Fallback preview tool",
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
              "You are a routing assistant. Pick the best tool and args based on the user request. Respond as JSON only.",
          },
          {
            role: "user",
            content: [
              "Available tools:",
              JSON.stringify(toolCatalog, null, 2),
              'Respond with {"toolId": string, "resourceUri": string, "args": object}.',
              "Ensure args match the schema.",
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
                toolId: { type: "string" },
                resourceUri: { type: "string" },
                args: { type: "object" },
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
    if (!planJson?.toolId) {
      throw new Error("Planner did not return a toolId.");
    }
    const matched = availableTools.find((t) => t.toolId === planJson.toolId);
    if (!matched) {
      throw new Error(`Planner selected unknown tool: ${planJson.toolId}`);
    }

    return {
      toolId: planJson.toolId,
      resourceUri: planJson.resourceUri ?? matched.resourceUri ?? FALLBACK_RESOURCE_URI,
      args: planJson.args ?? {},
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
    if (!userInput.trim() || !hasApiKey || availableTools.length === 0) return;
    setStatus("planning");
    setError("");

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: userInput };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const nextPlan = await planWithOpenAI(userInput);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Planning tool: **${nextPlan.toolId}**`,
          plan: nextPlan,
        },
      ]);
      setStatus("calling");
      const data = await callTool(nextPlan);
      setStatus("done");

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Tool **${nextPlan.toolId}** executed.`,
          data,
          plan: nextPlan,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview failed";
      setError(message);
      setStatus("error");
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `**Error:** ${message}` }]);
    }
  };

  return (
    <div className="preview-page">
      <header className="hero">
        <div className="pill">Tinyverse Preview</div>
        <h1>LLM-routed tool preview</h1>
        <p>
          Paste your OpenAI API key, ask a question, and the preview will pick a tool, call it, and render the matching
          UI.
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
            label={hasApiKey ? "Key set (env/local)" : "Add an API key to plan tool calls"}
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
              <h2>Ask for a tool</h2>
              <p>The planner picks a tool + args; the dev server handles the call.</p>
            </div>
          </div>

          <div className="chat-feed">
            {messages.map((msg) => {
              return (
                <div key={msg.id} className={`bubble ${msg.role}`}>
                  <div className="bubble-role">{msg.role === "assistant" ? "Assistant" : "You"}</div>
                  <MessageText content={msg.content} />
                  {msg.plan && !msg.data && <StructuredPlan plan={msg.plan} />}
                  {msg.plan && msg.data && (
                    <ToolResponseCard plan={msg.plan} data={msg.data} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="composer">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              rows={3}
              placeholder="Ask anything; the planner will pick the tool."
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
      </main>
    </div>
  );
};

export default App;
