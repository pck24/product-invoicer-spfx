import * as React from 'react';
import { Badge } from '@fluentui/react-components';
import { BadgeColor } from '../derive';

export interface IStatusBadgeProps {
  color: BadgeColor;
  text: string;
  size?: 'small' | 'medium';
}

/** gelb = fällig, rot = neue Position offen, grün = verrechnet, grau = gekündigt, blau = neu/anteilig. */
export function StatusBadge({ color, text, size = 'medium' }: IStatusBadgeProps): React.ReactElement {
  return (
    <Badge appearance="tint" color={color} size={size === 'small' ? 'small' : 'large'} shape="rounded">
      {text}
    </Badge>
  );
}
