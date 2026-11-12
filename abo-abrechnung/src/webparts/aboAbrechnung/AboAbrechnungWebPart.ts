import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Version } from '@microsoft/sp-core-library';
import { type IPropertyPaneConfiguration, PropertyPaneDropdown, PropertyPaneLabel, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { ThemeChangedEventArgs, ThemeProvider } from '@microsoft/sp-component-base';
import type { MSGraphClientV3 } from '@microsoft/sp-http';
import type { Theme } from '@fluentui/react-components';
import { spfi, SPFx, SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/files';
import '@pnp/sp/folders';
import { parseUstSatz } from '../../billing/money';
import { Repository } from '../../data/repositories';
import { App } from '../../ui/App';

export interface IAboAbrechnungWebPartProps {
  ustSatz: number;
  dateinamenMuster: string;
  vorlageUrl?: string;
  exportOrdner?: string;
  ausgabeformat?: 'pdf' | 'docx';
}

/** Standardwerte, wenn im Property Pane nichts eingetragen ist. */
const STANDARD_VORLAGE = '/sites/JustElevate-Kunden/Freigegebene Dokumente/briefpapier.docx';
const STANDARD_EXPORTORDNER = '/sites/JustElevate-Kunden/Freigegebene Dokumente';

export default class AboAbrechnungWebPart extends BaseClientSideWebPart<IAboAbrechnungWebPartProps> {
  private _root: Root | undefined;
  private _sp!: SPFI;
  private _repo!: Repository;
  private _themeProvider!: ThemeProvider;
  private _theme: Theme | undefined;
  private _graph: Promise<MSGraphClientV3> | undefined;

  protected async onInit(): Promise<void> {
    this._sp = spfi().using(SPFx(this.context));
    this._repo = new Repository(this._sp);
    this._themeProvider = this.context.serviceScope.consume(ThemeProvider.serviceKey);
    this._theme = this._themeProvider.tryGetThemeV2();
    this._themeProvider.themeChangedEvent.add(this, (args: ThemeChangedEventArgs) => {
      this._theme = args.themeV2;
      this.render();
    });
  }

  public render(): void {
    const p = this.properties;
    const web = this.context.pageContext.web;
    const element = React.createElement(App, {
      theme: this._theme,
      services: {
        sp: this._sp,
        repo: this._repo,
        settings: {
          ustSatz: parseUstSatz(p.ustSatz),
          dateinamenMuster: p.dateinamenMuster || '{rechnungsnummer}_{kundennummer}_{kundenname}',
          vorlageUrl: (p.vorlageUrl || '').trim() || STANDARD_VORLAGE,
          exportOrdner: (p.exportOrdner || '').trim() || STANDARD_EXPORTORDNER,
          ausgabeformat: p.ausgabeformat === 'docx' ? 'docx' : 'pdf'
        },
        exportEnv: {
          sp: this._sp,
          getGraph: () => {
            if (!this._graph) {
              // Fehlschlag nicht cachen (z. B. vor der API-Freigabe), sonst bleibt er bis zum Neuladen bestehen
              this._graph = this.context.msGraphClientFactory.getClient('3').catch((e) => {
                this._graph = undefined;
                throw e;
              });
            }
            return this._graph;
          },
          siteHost: new URL(web.absoluteUrl).hostname,
          siteServerRelativeUrl: web.serverRelativeUrl
        },
        openSettings: () => this.context.propertyPane.open()
      }
    });
    if (!this._root) this._root = createRoot(this.domElement);
    this._root.render(element);
  }

  protected onDispose(): void {
    this._root?.unmount();
    this._root = undefined;
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  /** Prüft, ob eine Datei (.docx) bzw. ein Ordner unter der serverrelativen URL existiert. */
  private async _checkPath(value: string, kind: 'datei' | 'ordner'): Promise<string> {
    const v = (value || '').trim();
    if (!v) return '';
    if (!v.startsWith('/')) return 'Serverrelative URL angeben, z. B. /sites/…/Freigegebene Dokumente/…';
    try {
      if (kind === 'datei') {
        if (!/\.docx$/i.test(v)) return 'Bitte eine .docx-Datei angeben.';
        return (await this._sp.web.getFileByServerRelativePath(v).exists()) ? '' : 'Datei nicht gefunden.';
      }
      return (await this._sp.web.getFolderByServerRelativePath(v.replace(/\/+$/, '')).select('Exists')<{ Exists: boolean }>()).Exists
        ? ''
        : 'Ordner nicht gefunden.';
    } catch {
      return kind === 'datei' ? 'Datei nicht gefunden.' : 'Ordner nicht gefunden.';
    }
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: 'Einstellungen der Abo-Abrechnung' },
          groups: [
            {
              groupName: 'PDF-Export',
              groupFields: [
                PropertyPaneTextField('vorlageUrl', {
                  label: 'Word-Vorlage (.docx)',
                  description: `Serverrelative URL. Leer = ${STANDARD_VORLAGE}`,
                  onGetErrorMessage: (v: string) => this._checkPath(v, 'datei'),
                  deferredValidationTime: 500
                }),
                PropertyPaneTextField('exportOrdner', {
                  label: 'Export-Ordner',
                  description: `Serverrelative URL eines Ordners in einer Dokumentbibliothek. Leer = ${STANDARD_EXPORTORDNER}`,
                  onGetErrorMessage: (v: string) => this._checkPath(v, 'ordner'),
                  deferredValidationTime: 500
                }),
                PropertyPaneDropdown('ausgabeformat', {
                  label: 'Ausgabeformat',
                  selectedKey: this.properties.ausgabeformat || 'pdf',
                  options: [
                    { key: 'pdf', text: 'PDF (Umwandlung über Microsoft Graph)' },
                    { key: 'docx', text: 'Word (.docx), ohne Umwandlung' }
                  ]
                }),
                PropertyPaneTextField('dateinamenMuster', {
                  label: 'Dateiname',
                  description: 'Platzhalter: {rechnungsnummer}, {kundennummer}, {kundenname}. Die Variante ohne Kosten erhält den Zusatz „_Leistungsuebersicht“.'
                }),
                PropertyPaneLabel('hinweis', {
                  text: 'Eine Beispielvorlage mit allen Platzhaltern liegt im Projekt unter docs/Rechnungsvorlage-Beispiel.docx.'
                })
              ]
            },
            {
              groupName: 'Rechnung',
              groupFields: [
                PropertyPaneTextField('ustSatz', {
                  label: 'USt-Satz (%)',
                  onGetErrorMessage: (v: string) => (parseUstSatz(v, -1) >= 0 ? '' : 'Zahl ab 0 angeben, z. B. 20')
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
