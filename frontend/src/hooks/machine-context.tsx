'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ImportMachine } from '@/hooks/useImportMachine';

/**
 * React Flow renders our custom nodes deep inside its own tree, so the nodes reach the import
 * machine through context rather than props (node `data` is deliberately kept free of live state —
 * that is the performance fix). The provider is mounted once at the page level, above both the
 * desktop canvas and the mobile stack, so a single machine drives whichever shell is shown.
 */
const MachineContext = createContext<ImportMachine | null>(null);

export function MachineProvider({
  machine,
  children,
}: {
  machine: ImportMachine;
  children: ReactNode;
}) {
  return <MachineContext.Provider value={machine}>{children}</MachineContext.Provider>;
}

export function useMachine(): ImportMachine {
  const machine = useContext(MachineContext);
  if (!machine) throw new Error('useMachine must be used inside a MachineProvider');
  return machine;
}
