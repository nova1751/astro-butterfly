// @ts-check
import { defineEcConfig, definePlugin } from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { transformerColorizedBrackets } from '@shikijs/colorized-brackets';

const LABELS = { 'vue-html': 'Vue', vue: 'Vue', js: 'JS', ts: 'TS', jsx: 'JSX', tsx: 'TSX', bash: 'Bash', sh: 'Shell' };
const PLAIN = new Set(['', 'txt', 'text', 'plaintext', 'plain']);

/** Butterfly "mac" header: traffic-light dots + language label when no explicit title. */
function pluginLanguageTitle() {
  return definePlugin({
    name: 'language-title',
    hooks: {
      preprocessMetadata: ({ codeBlock }) => {
        if (codeBlock.props.title) return;
        const lang = codeBlock.language ?? '';
        if (PLAIN.has(lang)) return;
        codeBlock.props.title = LABELS[/** @type {keyof typeof LABELS} */ (lang)] ?? lang.toUpperCase();
      },
    },
  });
}

export default defineEcConfig({
  themes: ['one-dark-pro'],
  useDarkModeMediaQuery: false,
  plugins: [pluginLineNumbers(), pluginLanguageTitle()],
  shiki: { transformers: [transformerColorizedBrackets()] },
  defaultProps: {
    frame: 'terminal',
    showLineNumbers: true,
    overridesByLang: { 'bash,sh,shell,powershell': { showLineNumbers: false } },
  },
  frames: {
    showCopyToClipboardButton: false, // replaced by the header toolbar (src/theme/scripts/code.ts)
    extractFileNameFromCode: false, // never remove a first-line comment from the code
  },
  styleOverrides: {
    borderRadius: '10px',
    borderWidth: '0px',
    codeFontFamily: "ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'SF Mono', Consolas, 'Liberation Mono', monospace",
    codeFontSize: '0.875rem',
    codeLineHeight: '1.7',
    codePaddingBlock: 'var(--code-padding-block, 12px)',
    codePaddingInline: 'var(--code-padding-inline, 16px)',
    uiFontFamily: 'inherit',
    gutterBorderWidth: '0px',
    frames: {
      shadowColor: 'transparent',
      frameBoxShadowCssValue: 'none',
      terminalTitlebarBackground: '#21252b',
      terminalTitlebarBorderBottomColor: 'rgba(255,255,255,0.06)',
      terminalTitlebarForeground: '#9aa4b2',
      terminalBackground: '#282c34',
    },
  },
});
