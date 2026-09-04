import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

test('acrylic mode frosts the terminal surface instead of only lowering its tint opacity', () => {
  const rule = css.match(
    /\.app-window\[data-backdrop-type=['"]acrylic['"]\]\s+\.terminal-panel\s*\{([^}]*)\}/,
  );

  assert.ok(rule, 'acrylic mode must define a terminal-specific glass surface');
  assert.match(rule[1], /(?:-webkit-)?backdrop-filter\s*:\s*blur\(/);
});

test('acrylic tint leaves enough of the native material visible at minimum terminal opacity', () => {
  const base = css.match(/--acrylic-base-opacity:\s*([\d.]+)/);
  const strongestGradient = css.match(/--acrylic-gradient-end-opacity:\s*([\d.]+)/);

  assert.ok(base && strongestGradient, 'acrylic tint opacity must be explicit and testable');
  const combinedTintOpacity = 1 - (1 - Number(base[1])) * (1 - Number(strongestGradient[1]));
  assert.ok(
    combinedTintOpacity <= 0.6,
    `acrylic tint hides too much native material (${Math.round(combinedTintOpacity * 100)}% opaque)`,
  );
});

test('the whole acrylic background follows the shared opacity scale', () => {
  const rule = css.match(
    /\.app-window\[data-backdrop-type=['"]acrylic['"]\]\s+\.app-background\s*\{([^}]*)\}/,
  );

  assert.ok(rule, 'acrylic mode must define the shared window background');
  assert.match(rule[1], /var\(--acrylic-opacity-scale(?:,\s*1)?\)/);
});
