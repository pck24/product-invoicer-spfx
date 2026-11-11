import * as React from 'react';
import { SPFI } from '@pnp/sp';
import { Repository } from '../data/repositories';
import { IExportEnv } from '../export/pdfExport';

export interface IAppSettings {
  ustSatz: number;
  dateinamenMuster: string;
  vorlageUrl?: string;
  exportOrdner?: string;
}

export interface IAppServices {
  sp: SPFI;
  repo: Repository;
  settings: IAppSettings;
  exportEnv: IExportEnv;
  /** öffnet die Webpart-Einstellungen (Property Pane) */
  openSettings: () => void;
}

export const AppContext = React.createContext<IAppServices | undefined>(undefined);

export function useApp(): IAppServices {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('AppContext fehlt');
  return ctx;
}
