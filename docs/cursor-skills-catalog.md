# Cursor Skills Catalog

Generated: 2026-09-26

Reference catalog of Agent Skills discoverable in the Cloud Agent environment used for this project, plus Cursor built-in slash skills and Grok Build skills documented in `AGENTS.md`.

Skills are markdown instruction packages (`SKILL.md`) that teach the agent domain-specific workflows. See [Cursor Agent Skills docs](https://cursor.com/docs/skills).

## Summary

| Source                                         |   Count |
| ---------------------------------------------- | ------: |
| Installed SKILL.md files (this environment)    |     107 |
| Cursor built-in slash skills                   |      19 |
| Grok Build skills (documented, not in this VM) |      16 |
| **Total documented below**                     | **142** |

Third-party marketplaces (PromptBase, community packs) may list 160–440+ additional skills; those are not installed here unless added to `~/.cursor/skills/` or via plugins.

---

## Part 1 — Installed skills (107)

### Cursor Platform (Cloud)

| #   | Skill                   | Description                                                                                                                                                                                               |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `canvas`                | metadata: surfaces: - ide - cloud                                                                                                                                                                         |
| 2   | `env-setup`             | Explain, inspect, configure, and troubleshoot Cloud Agent development environments. Use when the user asks about environment setup, changing/improving the environment, or triggering/testing a build.    |
| 3   | `migrate-to-builds`     | Test that a Cloud Agent environment will work with prebuilt environment builds and recommend any required changes. Use when the user wants to migrate to builds, test build compatibility, or follow the… |
| 4   | `subscribe`             | "Wait for external events (GitHub or Origin CI/PR, Slack messages, Linear issues) by subscribing with the cursor-subscriptions MCP tools instead of polling."                                             |
| 5   | `walkthrough-artifacts` | "Create walkthrough artifacts (screenshots and screen recordings) that prove code changes work. Use when finishing tested changes and uploading demo evidence for the user."                              |

### Adobe App Builder Plugin

| #   | Skill                          | Description                                                                                                                                                                                               |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | `appbuilder-action-scaffolder` | Create, implement, deploy, and debug Adobe Runtime actions with consistent layout, validation, and error handling. Use this skill whenever the user needs to add actions to an App Builder project, unde… |
| 7   | `appbuilder-cicd-pipeline`     | - Set up CI/CD pipelines for Adobe App Builder projects. Generates GitHub Actions workflows using adobe/aio-cli-setup-action@3 and adobe/aio-apps-action@3.3.0, plus patterns for Azure DevOps and GitLa… |
| 8   | `appbuilder-e2e-testing`       | - Use this skill whenever the user wants browser-based end-to-end tests for an Adobe App Builder application. Covers Playwright E2E testing for ExC Shell SPAs, AEM extension UIs, and full-stack flows.… |
| 9   | `appbuilder-project-init`      | Initialize an Adobe App Builder project end-to-end without Developer Console UI clicks. Creates the Console project and workspace, subscribes APIs (including those needing a product profile), maps use… |
| 10  | `appbuilder-testing`           | - Generate and run tests for Adobe App Builder actions and UI components. Scaffolds Jest unit tests, integration tests against deployed actions, contract tests for Adobe API interactions, and React co… |
| 11  | `appbuilder-ui-scaffolder`     | - Generate React Spectrum UI components for Adobe Experience Cloud Shell SPAs and AEM UI Extensions. Provides patterns for pages, forms, data tables, dialogs, and navigation using @adobe/react-spectru… |

### Vercel Plugin (internal/dev)

| #   | Skill                | Description                                                                                                                                                                                               |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | `benchmark-agents`   | Advanced AI agent benchmark scenarios that push Vercel's cutting-edge platform features — Workflow SDK, AI Gateway, MCP, Chat SDK, Queues, Flags, Sandbox, and multi-agent orchestration. Designed to st… |
| 13  | `benchmark-e2e`      | End-to-end benchmark suite for vercel-plugin. Runs realistic projects through skill injection, launches dev servers, verifies everything works, analyzes conversation logs, and produces an improvement … |
| 14  | `benchmark-sandbox`  | Run vercel-plugin eval scenarios in Vercel Sandboxes instead of local WezTerm panels. Provisions ephemeral microVMs with Claude Code + plugin pre-installed, runs benchmark prompts, extracts hook artif… |
| 15  | `benchmark-testing`  | Create and launch benchmark test projects to exercise vercel-plugin skill injection across realistic scenarios. Sets up isolated directories, installs the plugin, and spawns WezTerm panes running Clau… |
| 16  | `plugin-audit`       | Audit vercel-plugin performance on real-world projects. Extracts tool calls from Claude Code conversation logs, tests hook matching against actual inputs, identifies pattern coverage gaps, and checks … |
| 17  | `release`            | Release vercel-plugin — run gates, bump version, generate artifacts, commit, and push. Use when asked to "release", "ship", "bump and push", or "cut a release".                                          |
| 18  | `vercel-plugin-eval` | Run live eval sessions against the vercel-plugin to verify hook behavior, skill injection, dedup correctness, and coverage. Launches real Claude Code sessions via WezTerm, monitors debug logs, and pro… |

### Vercel Plugin (upstream reference)

| #   | Skill                         | Description                                                                                                                                                                                               |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19  | `ai-sdk`                      | 'Answer questions about the AI SDK and help build AI-powered features. Use when developers: (1) Ask about AI SDK functions like generateText, streamText, ToolLoopAgent, embed, or tools, (2) Want to bu… |
| 20  | `chat-sdk`                    | Build multi-platform chat bots with Chat SDK (`chat` npm package). Use when developers want to (1) Build a Slack, Teams, Google Chat, Discord, Telegram, GitHub, Linear, or WhatsApp bot, (2) Use Chat S… |
| 21  | `eve`                         | Build durable backend AI agents with the eve framework. Use when creating, editing, or debugging an eve project — agent instructions, skills, tools, connections, channels, sandboxes, subagents, schedu… |
| 22  | `next-best-practices`         | Next.js best practices - file conventions, RSC boundaries, data patterns, async APIs, metadata, error handling, route handlers, image/font optimization, bundling user-invocable: false                   |
| 23  | `next-cache-components`       | Next.js 16 Cache Components - PPR, use cache directive, cacheLife, cacheTag, updateTag                                                                                                                    |
| 24  | `next-forge`                  | Expert assistance for next-forge — a production-grade Turborepo template for Next.js SaaS apps. Triggers on questions about next-forge installation, setup, architecture, packages, customization, deplo… |
| 25  | `next-upgrade`                | Upgrade Next.js to the latest version following official migration guides and codemods argument-hint: "[target-version]"                                                                                  |
| 26  | `vercel-cli`                  | Deploy, manage, and develop projects on Vercel from the command line                                                                                                                                      |
| 27  | `vercel-react-best-practices` | React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patter… |
| 28  | `vercel-sandbox`              | Run agent-browser + Chrome inside Vercel Sandbox microVMs for browser automation from any Vercel-deployed app. Use when the user needs browser automation in a Vercel app (Next.js, SvelteKit, Nuxt, Rem… |
| 29  | `workflow`                    | Creates durable, resumable workflows using Vercel's Workflow SDK. Use when building workflows that need to survive restarts, pause for external events, retry on failure, or coordinate multi-step opera… |

### Vercel Plugin

| #   | Skill                                | Description                                                                                                                                                                                               |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30  | `access-protected-vercel-deployment` | Access and test Vercel deployments protected by Vercel Authentication, SSO, or Deployment Protection. Use when curl, agent-browser, Playwright, or another automated request reaches a Vercel login or p… |
| 31  | `ai-gateway`                         | Vercel AI Gateway expert guidance. Use when configuring model routing, provider failover, cost tracking, or managing multiple AI providers through a unified API.                                         |
| 32  | `ai-sdk`                             | Vercel AI SDK expert guidance. Use when building AI-powered features — chat interfaces, text generation, structured output, tool calling, agents, MCP integration, streaming, embeddings, reranking, ima… |
| 33  | `auth`                               | Authentication integration guidance — Clerk (native Vercel Marketplace), Descope, and Auth0 setup for Next.js applications. Covers middleware auth patterns, sign-in/sign-up flows, and Marketplace prov… |
| 34  | `bootstrap`                          | Project bootstrapping orchestrator for repos that depend on Vercel-linked resources (databases, auth, and managed integrations). Use when setting up or repairing a repository so linking, environment p… |
| 35  | `build-agents`                       | "Default guidance for building AI agents. Use for generic requests to build, create, scaffold, design, architect, or implement an AI agent, agent app, tool-calling agent, durable agent, multi-agent sy… |
| 36  | `cdn-caching`                        | Debug Vercel CDN caching — cache hit rate, stale content, revalidation behavior, ISR + PPR, per-request cache reasons (cacheReason) and PPR state (ppr_state), and costs.                                 |
| 37  | `chat-sdk`                           | Vercel Chat SDK expert guidance. Use when building multi-platform chat bots — Slack, Telegram, Microsoft Teams, Discord, Google Chat, GitHub, Linear — with a single codebase. Covers the Chat class, ad… |
| 38  | `deployments-cicd`                   | Vercel deployment and CI/CD expert guidance. Use when deploying, promoting, rolling back, inspecting deployments, building with --prebuilt, or configuring CI workflow files for Vercel.                  |
| 39  | `env-vars`                           | Vercel environment variable expert guidance. Use when working with .env files, vercel env commands, OIDC tokens, or managing environment-specific configuration.                                          |
| 40  | `eve`                                | "eve framework guidance for durable AI agents and agent-powered applications. Use when creating, editing, or debugging an eve project, when the user explicitly asks for eve, or when the build-agents s… |
| 41  | `knowledge-update`                   | Corrects outdated LLM knowledge about the Vercel platform and introduces new products. Injected at session start.                                                                                         |
| 42  | `marketplace`                        | Vercel Marketplace expert guidance — discovering, installing, and managing third-party integrations via the `vercel integration` CLI. Use when building any app that needs an external capability withou… |
| 43  | `microfrontends`                     | Guide for building, configuring, and deploying microfrontends on Vercel. Use this skill when the user mentions microfrontends, multi-zones, splitting an app across teams, independent deployments, cros… |
| 44  | `next-cache-components`              | Next.js 16 Cache Components guidance — PPR, use cache directive, cacheLife, cacheTag, updateTag, and migration from unstable_cache. Use when implementing partial prerendering, caching strategies, or m… |
| 45  | `next-forge`                         | next-forge expert guidance — production-grade Turborepo monorepo SaaS starter by Vercel. Use when working in a next-forge project, scaffolding with `npx next-forge init`, or editing @repo/* workspace … |
| 46  | `next-upgrade`                       | Upgrade Next.js to the latest version following official migration guides and codemods. Use when upgrading Next.js versions, running codemods, or migrating between major releases.                       |
| 47  | `nextjs`                             | Next.js App Router expert guidance. Use when building, debugging, or architecting Next.js applications — routing, Server Components, Server Actions, Cache Components, layouts, middleware/proxy, data f… |
| 48  | `react-best-practices`               | React best-practices reviewer for TSX files. Triggers after editing multiple TSX components to run a condensed quality checklist covering component structure, hooks usage, accessibility, performance, … |
| 49  | `routing-middleware`                 | Vercel Routing Middleware guidance — request interception before cache, rewrites, redirects, personalization. Works with any framework. Supports Edge, Node.js, and Bun runtimes. Use when intercepting … |
| 50  | `runtime-cache`                      | Vercel Runtime Cache API guidance — ephemeral per-region key-value cache with tag-based invalidation. Shared across Functions, Routing Middleware, and Builds. Use when implementing caching strategies … |
| 51  | `shadcn`                             | shadcn/ui expert guidance — CLI, component installation, composition patterns, custom registries, theming, Tailwind CSS integration, and high-quality interface design. Use when initializing shadcn, ad… |
| 52  | `turbopack`                          | Turbopack expert guidance. Use when configuring the Next.js bundler, optimizing HMR, debugging build issues, or understanding the Turbopack vs Webpack differences.                                       |
| 53  | `vercel-agent`                       | Vercel Agent guidance — AI-powered code review, incident investigation, and SDK installation. Automates PR analysis and anomaly debugging. Use when configuring or understanding Vercel's AI development… |
| 54  | `vercel-cli`                         | Vercel CLI expert guidance. Use when deploying, managing environment variables, linking projects, viewing logs, querying metrics, managing domains, or interacting with the Vercel platform from the com… |
| 55  | `vercel-connect`                     | Vercel Connect expert guidance — securely obtain scoped OAuth tokens for third-party services (Slack, GitHub, MCP servers, OAuth, Snowflake) on behalf of apps or users via Vercel OIDC. Use when wiring… |
| 56  | `vercel-firewall`                    | Vercel Firewall expert guidance — automatic DDoS mitigation, the Vercel WAF (custom rules, IP blocking, managed rulesets, rate limiting), Attack Mode, system bypass, bot management, and the `vercel fi… |
| 57  | `vercel-functions`                   | Vercel Functions expert guidance — Serverless Functions, Edge Functions, Fluid Compute, streaming, Cron Jobs, and runtime configuration. Use when configuring, debugging, or optimizing server-side code… |
| 58  | `vercel-sandbox`                     | Vercel Sandbox guidance — ephemeral Firecracker microVMs for running untrusted code safely. Supports AI agents, code generation, and experimentation. Use when executing user-generated or AI-generated … |
| 59  | `vercel-services`                    | Configure and troubleshoot Vercel Services for multiple frontends and backends in one project. Use when composing a polyglot or multi-service application on one Vercel deployment; defining the `servic… |
| 60  | `vercel-storage`                     | Vercel storage expert guidance — Blob, Edge Config, and Marketplace storage (Neon Postgres, Upstash Redis). Use when choosing, configuring, or using data storage with Vercel applications.               |
| 61  | `verification`                       | "Full-story verification — infers what the user is building, then verifies the complete flow end-to-end: browser → API → data → response. Triggers on dev server start and 'why isn't this working' sign… |
| 62  | `workflow`                           | Vercel Workflow SDK expert guidance. Use when building durable workflows, long-running tasks, API routes or agents that need pause/resume, retries, step-based execution, or crash-safe orchestration wi… |

### Hugging Face Plugin

| #   | Skill                            | Description                                                                                                                                                                                               |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 63  | `hf-cli`                         | "Hugging Face Hub CLI (`hf`) for downloading, uploading, and managing models, datasets, spaces, buckets, repos, papers, jobs, and more on the Hugging Face Hub. Use when: handling authentication; manag… |
| 64  | `hf-mcp`                         | Use Hugging Face Hub via MCP server tools. Search models, datasets, Spaces, papers. Get repo details, fetch documentation, run compute jobs, and use Gradio Spaces as AI tools. Available when connected… |
| 65  | `huggingface-best`               | Use when the user asks about finding the best, top, or recommended model for a task, wants to know what AI model to use, or wants to compare models by benchmark scores. Triggers on: "best model for X"… |
| 66  | `huggingface-community-evals`    | Run evaluations for Hugging Face Hub models using inspect-ai and lighteval on local hardware. Use for backend selection, local GPU evals, and choosing between vLLM / Transformers / accelerate. Not for… |
| 67  | `huggingface-datasets`           | Use this skill for Hugging Face Dataset Viewer API workflows that fetch subset/split metadata, paginate rows, search text, apply filters, download parquet URLs, and read size or statistics.             |
| 68  | `huggingface-gradio`             | Build Gradio web UIs and demos in Python. Use when creating or editing Gradio apps, components, event listeners, layouts, or chatbots.                                                                    |
| 69  | `huggingface-llm-trainer`        | Train or fine-tune language and vision models using TRL (Transformer Reinforcement Learning) or Unsloth with Hugging Face Jobs infrastructure. Covers SFT, DPO, GRPO and reward modeling training method… |
| 70  | `huggingface-local-models`       | "Use to select models to run locally with llama.cpp and GGUF on CPU, Mac Metal, CUDA, or ROCm. Covers finding GGUFs, quant selection, running servers, exact GGUF file lookup, conversion, and OpenAI-co… |
| 71  | `huggingface-lora-space-builder` | Build and publish a Gradio demo on Hugging Face Spaces for a user-provided LoRA. Use when someone asks to create, generate, ship, or publish a Space, demo, Gradio app, or playground for a LoRA — inclu… |
| 72  | `huggingface-paper-publisher`    | Publish and manage research papers on Hugging Face Hub. Supports creating paper pages, linking papers to models/datasets, claiming authorship, and generating professional markdown-based research artic… |
| 73  | `huggingface-papers`             | Look up and read Hugging Face paper pages in markdown, and use the papers API for structured metadata such as authors, linked models/datasets/spaces, Github repo and project page. Use when the user sh… |
| 74  | `huggingface-spaces`             | Build, deploy, and maintain applications on Hugging Face Spaces — Gradio / Docker / Static SDKs, ZeroGPU and dedicated hardware, model loading, debugging, buckets, inference providers, community grant… |
| 75  | `huggingface-tool-builder`       | Use this skill when the user wants to build tool/scripts or achieve a task where using data from the Hugging Face API would help. This is especially useful when chaining or combining API calls or the … |
| 76  | `huggingface-trackio`            | Track and visualize ML training experiments with Trackio. Use when logging metrics during training (Python API), firing alerts for training diagnostics, or retrieving/analyzing logged metrics (CLI). S… |
| 77  | `huggingface-vision-trainer`     | Trains and fine-tunes vision models for object detection (D-FINE, RT-DETR v2, DETR, YOLOS), image classification (timm models — MobileNetV3, MobileViT, ResNet, ViT/DINOv3 — plus any Transformers class… |
| 78  | `huggingface-zerogpu`            | AI demos and GPU compute with Gradio Spaces and Hugging Face Spaces ZeroGPU. Use when writing or reviewing code that uses `@spaces.GPU`, configuring `python_version` or `requirements.txt` for a ZeroGP… |
| 79  | `train-sentence-transformers`    | Train or fine-tune sentence-transformers models across `SentenceTransformer` (bi-encoder; dense or static embedding model; for retrieval, similarity, clustering, classification, paraphrase mining, ded… |
| 80  | `transformers-js`                | Use Transformers.js to run state-of-the-art machine learning models directly in JavaScript/TypeScript. Supports NLP (text classification, translation, summarization), computer vision (image classifica… |
| 81  | `trl-training`                   | Train and fine-tune transformer language models using TRL (Transformers Reinforcement Learning). Supports SFT, DPO, GRPO, KTO, RLOO and Reward Model training via CLI commands.                           |

### Playwright (npm)

| #   | Skill                          | Description                                                                                                                                                                                               |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 82  | `playwright-cli`               | Automate browser interactions, test web pages and work with Playwright tests. allowed-tools: Bash(playwright-cli:_) Bash(npx:_) Bash(npm:*)                                                               |
| 83  | `playwright-component-testing` | Set up component testing with Playwright using a story gallery — scaffold stories and a gallery dev page driven by the built-in mount fixture, no dedicated component-testing runtime. Use when asked to… |
| 84  | `playwright-trace`             | Inspect Playwright trace files from the command line — list actions, view requests, console, errors, snapshots and screenshots. allowed-tools: Bash(npx:*)                                                |

### TanStack (npm)

| #   | Skill                               | Description                                                                                                                                                                                               |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 85  | `migrate-from-nextjs`               | - Step-by-step migration from Next.js App Router to TanStack Start: route definition conversion, API mapping, server function conversion from Server Actions, middleware conversion, data fetching patte… |
| 86  | `react-start`                       | - React bindings for TanStack Start: createStart, StartClient, StartServer, React-specific imports, re-exports from @tanstack/react-router, full project setup with React, useServerFn hook.              |
| 87  | `router-core`                       | - Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, rou… |
| 88  | `router-core/auth-and-guards`       | - Route protection with beforeLoad, redirect()/throw redirect(), isRedirect helper, authenticated layout routes (_authenticated), non-redirect auth (inline login), RBAC with roles and permissions, aut… |
| 89  | `router-core/code-splitting`        | - Automatic code splitting (autoCodeSplitting), .lazy.tsx convention, createLazyFileRoute, createLazyRoute, lazyRouteComponent, getRouteApi for typed hooks in split files, codeSplitGroupings per-route… |
| 90  | `router-core/data-loading`          | - Route loader option, loaderDeps for cache keys, staleTime/gcTime/ defaultPreloadStaleTime SWR caching, pendingComponent/pendingMs/ pendingMinMs, errorComponent/onError/onCatch, beforeLoad, router co… |
| 91  | `router-core/navigation`            | - Link component, useNavigate, Navigate component, router.navigate, ToOptions/NavigateOptions/LinkOptions, from/to relative navigation, activeOptions/activeProps, preloading (intent/viewport/render), … |
| 92  | `router-core/not-found-and-errors`  | - notFound() function, notFoundComponent, defaultNotFoundComponent, notFoundMode (fuzzy/root), errorComponent, CatchBoundary, CatchNotFound, isNotFound, NotFoundRoute (deprecated), route masking (mask… |
| 93  | `router-core/path-params`           | - Dynamic path segments ($paramName), splat routes ($ / _splat), optional params ({-$paramName}), prefix/suffix patterns ({$param}.ext), useParams, params.parse/stringify, pathParamsAllowedCharacters,… |
| 94  | `router-core/search-params`         | - validateSearch, search param validation with Zod/Valibot/ArkType adapters, fallback(), search middlewares (retainSearchParams, stripSearchParams), custom serialization (parseSearch, stringifySearch)… |
| 95  | `router-core/ssr`                   | - Non-streaming and streaming SSR, RouterClient/RouterServer, renderRouterToString/renderRouterToStream, createRequestHandler, defaultRenderHandler/defaultStreamHandler, HeadContent/Scripts components… |
| 96  | `router-core/type-safety`           | - Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-s… |
| 97  | `router-plugin`                     | - TanStack Router bundler plugin for route generation and automatic code splitting. Supports Vite, Webpack, Rspack, and esbuild. Configures autoCodeSplitting, routesDirectory, target framework, and co… |
| 98  | `server-components`                 | - Implement, review, debug, and refactor TanStack Start React Server Components in React 19 apps. Use when tasks mention @tanstack/react-start/rsc, renderServerComponent, createCompositeComponent, Com… |
| 99  | `start-core`                        | - Core overview for TanStack Start: tanstackStart() Vite plugin, getRouter() factory, root route document shell (HeadContent, Scripts, Outlet), client/server entry points, routeTree.gen.ts, tsconfig c… |
| 100 | `start-core/auth-server-primitives` | - Server-side authentication primitives for TanStack Start: session cookies (HttpOnly, Secure, SameSite, __Host- prefix), session read/issue/destroy via createServerFn and middleware, OAuth authorizat… |
| 101 | `start-core/deployment`             | - Deploy to Cloudflare Workers, Netlify, Vercel, Node.js/Docker, Bun, Railway. Selective SSR (ssr option per route), SPA mode, static prerendering, ISR with Cache-Control headers, SEO and head managem… |
| 102 | `start-core/execution-model`        | - Isomorphic-by-default principle, environment boundary functions (createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn), ClientOnly component, useHydrated hook, import protectio… |
| 103 | `start-core/middleware`             | - createMiddleware, request middleware (.server only), server function middleware (.client + .server), context passing via next({ context }), sendContext for client-server transfer, global middleware … |
| 104 | `start-core/server-functions`       | - createServerFn (GET/POST), validator (Zod or function), useServerFn hook, server context utilities (getRequest, getRequestHeader, setResponseHeader, setResponseStatus), error handling (throw errors,… |
| 105 | `start-core/server-routes`          | - Server-side API endpoints using the server property on createFileRoute, HTTP method handlers (GET, POST, PUT, DELETE), createHandlers for per-handler middleware, handler context (request, params, co… |
| 106 | `start-server-core`                 | - Server-side runtime for TanStack Start: createStartHandler, request/response utilities (getRequest, setResponseHeader, setCookie, getCookie, useSession), three-phase request handling, AsyncLocalStor… |
| 107 | `virtual-file-routes`               | - Programmatic route tree building as an alternative to filesystem conventions: rootRoute, index, route, layout, physical, defineVirtualSubtreeConfig. Use with TanStack Router plugin's virtualRouteCon… |

---

## Part 2 — Cursor built-in slash skills (19)

Managed by Cursor; invoke with `/skill-name` in Agent chat. Source: [cursor.com/docs/skills](https://cursor.com/docs/skills).

| #   | Skill                     | Description                                                                                          |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| 108 | `/automate`               | Creates Cursor Automations triggered by schedules, Slack messages, GitHub events, and other sources. |
| 109 | `/autopilot`              | Monitors a pull request and addresses feedback, conflicts, failing checks, and follow-up work.       |
| 110 | `/canvas`                 | Creates interactive React artifacts that render alongside the conversation.                          |
| 111 | `/create-hook`            | Creates Cursor hooks and updates hooks.json for agent lifecycle events.                              |
| 112 | `/create-rule`            | Creates Cursor rules with the appropriate scope and instructions.                                    |
| 113 | `/create-skill`           | Creates Agent Skills, including their structure and SKILL.md files.                                  |
| 114 | `/create-subagent`        | Creates custom subagents with focused roles and delegation instructions.                             |
| 115 | `/cursor-blame`           | Investigates AI-authored changes and the prompts that produced them.                                 |
| 116 | `/loop`                   | Runs a prompt or skill repeatedly at a specified interval.                                           |
| 117 | `/migrate-to-skills`      | Converts eligible dynamic rules and slash commands into Agent Skills.                                |
| 118 | `/review`                 | Selects and runs the appropriate code-review agent.                                                  |
| 119 | `/review-bugbot`          | Reviews code for likely bugs and regressions with Bugbot.                                            |
| 120 | `/review-security`        | Reviews code for security vulnerabilities with Security Review.                                      |
| 121 | `/sdk`                    | Helps you build applications and integrations with the Cursor SDK.                                   |
| 122 | `/shell`                  | Runs the provided text as a literal shell command.                                                   |
| 123 | `/split-to-prs`           | Splits large changes into smaller pull requests.                                                     |
| 124 | `/statusline`             | Configures the Cursor CLI status line.                                                               |
| 125 | `/update-cli-config`      | Updates Cursor CLI settings in ~/.cursor/cli-config.json.                                            |
| 126 | `/update-cursor-settings` | Finds and updates the appropriate Cursor or VS Code setting.                                         |

---

## Part 3 — Grok Build skills (16)

Documented in `AGENTS.md` under `.grok/skills/`. Present in Grok app-builder sandboxes; **not installed** in this Cursor Cloud Agent VM.

| #   | Skill                        | Description                                                |
| --- | ---------------------------- | ---------------------------------------------------------- |
| 127 | `auth`                       | Better Auth sign-in setup for Grok app builder.            |
| 128 | `neon`                       | Postgres / PGLite database patterns.                       |
| 129 | `og`                         | Open Graph share card metadata.                            |
| 130 | `xai-api`                    | xAI chat, Imagine image/video, voice TTS.                  |
| 131 | `controls`                   | WASD / vehicle controls; A=left self-test under chase cam. |
| 132 | `building-games`             | Game loops and 3D interaction patterns.                    |
| 133 | `multiplayer-p2p`            | WebRTC mesh for casual 2–8 player co-op.                   |
| 134 | `imagine`                    | 2D image generation prompt craft.                          |
| 135 | `game-asset-core`            | Game art QC doctrine and defaults.                         |
| 136 | `game-animation-frames`      | Animation loop laws and motion QC.                         |
| 137 | `game-tilesets`              | Seamless tile and transition rules.                        |
| 138 | `game-character-consistency` | Character turnarounds and variants.                        |
| 139 | `game-ui-icons`              | HUD and icon set guidance.                                 |
| 140 | `generate2dsprite`           | Magenta-key (#FF00FF) sprite sheet pipeline.               |
| 141 | `generate2dmap`              | 2D level/map generation for browser engines.               |
| 142 | `video2dsprite`              | Video → sprite sheet via ffmpeg chroma key.                |

---

## Skill discovery locations

| Location                                                    | Scope                     |
| ----------------------------------------------------------- | ------------------------- |
| `.cursor/skills/`                                           | Project-level             |
| `.agents/skills/`                                           | Project-level             |
| `~/.cursor/skills/`                                         | User-level (global)       |
| `~/.agents/skills/`                                         | User-level (global)       |
| Cursor plugins (Vercel, Hugging Face, Adobe App Builder, …) | Plugin-managed            |
| npm packages (TanStack, Playwright, …)                      | Bundled with dependencies |

View active skills in Cursor: **Customize → Skills**.
