import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Layering. The library (`src/lib`) never imports a component or a route, and
 * a component or a page route never imports a server-only module. Server-only
 * modules are the `*.server` files plus three that carry no suffix: `lib/db`,
 * `lib/pglite-sql` and `lib/auth/server`. Server functions (`createServerFn`)
 * live in `src/lib` (`firm/server.ts`, `profile-server.ts`, `account-server.ts`
 * and their siblings) and components call them from screens and page routes:
 * that is the design, not a violation — TanStack splits each function at the
 * client/server boundary, so the browser never receives the database code.
 * Only those server-function modules (and `src/routes/api/**`) touch the
 * database. The patterns keep a leading `**\/` so both the `@/` alias and a
 * relative path match.
 */
const NO_UPPER_LAYERS = {
  patterns: [
    {
      group: ["@/components/**", "**/components/**"],
      message: "The library does not import components.",
    },
    { group: ["@/routes/**", "**/routes/**"], message: "The library does not import routes." },
  ],
};

const SERVER_ONLY_PATTERNS = [
  {
    group: ["**/*.server"],
    message: "Server-only module: reach it through a server function, not a direct import.",
  },
  {
    group: ["@/lib/db", "**/lib/db", "**/pglite-sql", "@/lib/auth/server", "**/lib/auth/server"],
    message: "Server-only module: reach it through a server function, not a direct import.",
  },
];

const NO_SERVER_OR_ROUTES = {
  patterns: [
    ...SERVER_ONLY_PATTERNS,
    {
      group: ["@/routes/**", "**/routes/**"],
      message: "Components and page routes do not import routes.",
    },
  ],
};

/** `import("...server")`, `import("@/lib/db")` and any template-literal import source. */
const NO_DYNAMIC_SERVER = [
  {
    selector:
      'ImportExpression[source.type="Literal"][source.value=/(\\.server$|(^|\\/)lib\\/db$|(^|\\/)pglite-sql$|(^|\\/)lib\\/auth\\/server$)/]',
    message: "Server-only module: import it from src/routes/api only.",
  },
  {
    selector: 'ImportExpression[source.type="TemplateLiteral"]',
    message: "Dynamic imports take a string literal, so the layering rules can read them.",
  },
];

/** Flat ESLint config for the TanStack Start app-builder template. */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vercel/**",
      ".nitro/**",
      "node_modules/**",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Route files export `Route` beside the page's components by design, and the
  // TanStack Router plugin handles their hot reload, so this rule does not apply.
  {
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  // Layering: the library never reaches up into components or routes.
  // `src/lib/error-component.tsx` is a template file that AGENTS.md pins in
  // place, and it renders a Button, so it stays exempt (owner decision).
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    ignores: ["src/lib/error-component.tsx"],
    rules: { "no-restricted-imports": ["error", NO_UPPER_LAYERS] },
  },
  // Layering: components and page routes never import a server-only module or
  // a route. API routes are the server boundary and are exempt.
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", NO_SERVER_OR_ROUTES],
      "no-restricted-syntax": ["error", ...NO_DYNAMIC_SERVER],
    },
  },
  {
    files: ["src/routes/**/*.{ts,tsx}"],
    ignores: ["src/routes/api/**"],
    rules: {
      "no-restricted-imports": ["error", NO_SERVER_OR_ROUTES],
      "no-restricted-syntax": ["error", ...NO_DYNAMIC_SERVER],
    },
  },
  // Disable rules that conflict with Prettier formatting.
  prettier,
);
