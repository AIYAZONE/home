import { createContext, useContext } from 'react';

export type CopilotApi = {
  open: () => void;
  openWithDraft: (draft: string) => void;
  close: () => void;
};

const CopilotContext = createContext<CopilotApi | null>(null);

export function CopilotProvider(props: { value: CopilotApi; children: React.ReactNode }) {
  return <CopilotContext.Provider value={props.value}>{props.children}</CopilotContext.Provider>;
}

export function useCopilot(): CopilotApi {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error('CopilotProvider is missing');
  return ctx;
}

