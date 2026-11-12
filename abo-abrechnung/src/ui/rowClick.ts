import * as React from 'react';

const INTERACTIVE = 'button, a, input, textarea, select, [role="menuitem"], [role="checkbox"]';

/**
 * onClick für klickbare Tabellenzeilen. Ignoriert Klicks auf Bedienelemente in der Zeile
 * (Links, Menüknöpfe …) sowie Klicks aus Portalen wie Menüs und Dialogen, die React
 * trotz anderer DOM-Position an die Zeile weiterreicht.
 */
export function rowClick(handler: () => void): (e: React.MouseEvent<HTMLElement>) => void {
  return (e) => {
    const target = e.target as Element;
    if (!e.currentTarget.contains(target)) return;
    const control = target.closest(INTERACTIVE);
    if (control && e.currentTarget.contains(control)) return;
    handler();
  };
}
