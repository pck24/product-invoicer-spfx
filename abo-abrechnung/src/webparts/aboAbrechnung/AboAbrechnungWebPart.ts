import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Version } from '@microsoft/sp-core-library';
import { type IPropertyPaneConfiguration, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { ThemeChangedEventArgs, ThemeProvider } from '@microsoft/sp-component-base';
import type { Theme } from '@fluentui/react-components';
import { spfi, SPFx, SPFI } from '@pnp/sp';
import { Repository } from '../../data/repositories';
import { App } from '../../ui/App';

export interface IAboAbrechnungWebPartProps {
  ustSatz: number;
  rechnungsnummernMuster: string;
  dateinamenMuster: string;
  vorlageUrl?: string;
  exportOrdner?: string;
}

export default class AboAbrechnungWebPart extends BaseClientSideWebPart<IAboAbrechnungWebPartProps> {
  private _root: Root | undefined;
  private _sp!: SPFI;
  private _repo!: Repository;
  private _themeProvider!: ThemeProvider;
  private _theme: Theme | undefined;

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
    const element = React.createElement(App, {
      theme: this._theme,
      services: {
        sp: this._sp,
        repo: this._repo,
        settings: {
          ustSatz: typeof p.ustSatz === 'number' ? p.ustSatz : Number(p.ustSatz) || 20,
          rechnungsnummernMuster: p.rechnungsnummernMuster || 'RE-{YYYY}-{NNN}',
          dateinamenMuster: p.dateinamenMuster || '{rechnungsnummer}_{kundennummer}_{kundenname}',
          vorlageUrl: p.vorlageUrl,
          exportOrdner: p.exportOrdner
        }
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

  // Wird in Phase 5 um Vorlage, Export-Ordner und Dateinamen ergänzt.
  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: 'Einstellungen der Abo-Abrechnung' },
          groups: [
            {
              groupName: 'Rechnung',
              groupFields: [
                PropertyPaneTextField('ustSatz', { label: 'USt-Satz (%)' }),
                PropertyPaneTextField('rechnungsnummernMuster', { label: 'Rechnungsnummernmuster' })
              ]
            }
          ]
        }
      ]
    };
  }
}
