import * as React from 'react';
import { cn } from '@/lib/utils';

const Slider = React.forwardRef(({ className, value, min = 0, max = 100, step = 1, onValueChange, ...props }, ref) => (
  <input
    type="range"
    ref={ref}
    className={cn('h-4 w-40 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50', className)}
    value={value}
    min={min}
    max={max}
    step={step}
    onChange={event => onValueChange?.([Number(event.target.value)])}
    {...props}
  />
));
Slider.displayName = 'Slider';

export { Slider };
