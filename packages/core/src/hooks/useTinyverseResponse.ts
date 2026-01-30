import { useState, useEffect } from "react";

export interface TinyverseMessage {
  type: "tinyverse:toolResponse";
  data: any;
  toolId?: string;
  resourceUri?: string;
}

export const useTinyverseResponse = () => {
  const [response, setResponse] = useState<TinyverseMessage | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "tinyverse:toolResponse") {
        setResponse(event.data);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return response;
};
