import type { ComponentType } from "react";

export interface TinyverseUiMapping {
  toolId: string;
  resourceUri: string;
}

export type DecoratedComponent<P> = ComponentType<P> & { __tinyverse?: TinyverseUiMapping };

export const tinyverseUi = (mapping: TinyverseUiMapping) => {
  return <P,>(Component: DecoratedComponent<P>) => {
    (Component as DecoratedComponent<P>).__tinyverse = mapping;
    return Component;
  };
};
