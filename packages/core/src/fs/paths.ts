export const toolIdToFilename = (toolId: string): string => {
  return toolId.replace(/[^\w.-]/g, "_");
};
