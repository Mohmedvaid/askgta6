const COLOR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\s*\(/;

const TAILWIND_PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const TAILWIND_PREFIX =
  "bg|text|border|ring|ring-offset|fill|stroke|from|via|to|outline|decoration|divide|shadow|accent|caret|placeholder";

const TAILWIND_DEFAULT_CLASS = new RegExp(
  `(?:^|\\s)(?:[a-z-]+:)*(?:${TAILWIND_PREFIX})-(?:(?:${TAILWIND_PALETTE})-\\d{2,3}|black|white)(?:\\/\\d{1,3})?(?:$|\\s)`,
);

/**
 * Every visual value lives in lib/theme/tokens.css. This rule is the enforcement.
 */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Forbid color literals and Tailwind default palette classes outside the theme tokens." },
    schema: [],
    messages: {
      literal: "Color literal '{{ text }}' found. Add a token to lib/theme/tokens.css and use the utility that reads it.",
      palette:
        "Tailwind default palette class '{{ text }}' found. Use a token-backed utility such as bg-surface-1 or text-accent.",
    },
  },
  create(context) {
    function check(node, value) {
      if (typeof value !== "string" || value.length === 0) return;
      const literal = value.match(COLOR_LITERAL);
      if (literal) {
        context.report({ node, messageId: "literal", data: { text: literal[0] } });
        return;
      }
      const palette = ` ${value} `.match(TAILWIND_DEFAULT_CLASS);
      if (palette) {
        context.report({ node, messageId: "palette", data: { text: palette[0].trim() } });
      }
    }

    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};

const plugin = { rules: { "no-raw-color": rule } };

export default plugin;
