import React from "react";

export type ToolResponse = { result?: { forecast?: string[] } | any; forecast?: string[]; error?: string };

type ForecastCardsProps = {
  data: ToolResponse;
  toolId?: string | null;
  resourceUri?: string | null;
};

const ForecastCards: React.FC<ForecastCardsProps> = ({ data, toolId, resourceUri }) => {
  const list = data.result?.forecast ?? data.forecast;
  if (!Array.isArray(list)) return null;

  const mappingLabel = toolId && resourceUri ? `${toolId} (${resourceUri})` : toolId ?? resourceUri ?? "tool call";

  return (
    <div className="forecast-grid" data-tool-id={toolId ?? undefined} data-resource-uri={resourceUri ?? undefined}>
      {list.map((entry: string, idx: number) => (
        <div key={`${entry}-${idx}`} className="forecast-card">
          <div className="forecast-day">Day {idx + 1}</div>
          <div className="forecast-text">{entry}</div>
          <div className="forecast-meta">Source: {mappingLabel}</div>
        </div>
      ))}
    </div>
  );
};

export default ForecastCards;
