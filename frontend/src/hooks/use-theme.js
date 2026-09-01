import { useTheme as useNextTheme } from 'next-themes';

export function useTheme() {
  const { theme, setTheme, resolvedTheme, systemTheme } = useNextTheme();
  return { theme, setTheme, resolvedTheme, systemTheme };
}