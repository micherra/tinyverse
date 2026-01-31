import type { ComponentType } from "react";

export interface TinyverseUiMapping {
  toolId: string;
  resourceUri: string;
  previewTemplate?: string;
}

export type DecoratedComponent<P> = ComponentType<P> & { __tinyverse?: TinyverseUiMapping };

export const tinyverseUi = (options: TinyverseUiMapping | string) => {
  const mapping = typeof options === "string" ? { toolId: options, resourceUri: "" } : options;
  return <P,>(Component: DecoratedComponent<P>) => {
    (Component as DecoratedComponent<P>).__tinyverse = mapping;
    return Component;
  };
};
