import * as React from 'react';
import { SPFI } from '@pnp/sp';
import { Repository } from '../data/repositories';

export interface IAppSettings {
  ustSatz: number;
  rechnungsnummernMuster: string;
  dateinamenMuster: string;
  vorlageUrl?: string;
  exportOrdner?: string;
}

export interface IAppServices {
  sp: SPFI;
  repo: Repository;
  settings: IAppSettings;
}

export const AppContext = React.createContext<IAppServices | undefined>(undefined);

export function useApp(): IAppServices {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('AppContext fehlt');
  return ctx;
}
