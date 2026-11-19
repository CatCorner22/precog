import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonClass } from "@/components/ui/button-variants";
import { resolveNavTarget } from "@/lib/precog/navigation";

export const Route = createFileRoute("/blakegpt")({
  component: BlakeGPTHome,
  head: () => ({
    meta: [
      { title: "BlakeGPT" },
      { name: "description", content: "Choose a practical next step for your dental practice." },
    ],
  }),
});

const voyager = resolveNavTarget("voyager");
const voyagerTab = voyager && "tab" in voyager ? voyager.tab : null;

const modules = [
  {
    name: "Precog",
    description: "Internal controls and continuity for the practice.",
    action: "Open Precog",
    href: "/",
  },
  {
    name: "Frontier GRC",
    description: "Checks for invoices, notice deadlines, duty conflicts and policy wording.",
    action: "Open checks",
    href: "/",
  },
  {
    name: "Compliance desk",
    description: "Cited Tennessee and federal rules for the dental office.",
    action: "Open the desk",
    href: "/desk",
  },
  {
    name: "Study evaluator",
    description: "Check study numbers, design flaws, and evidence grades.",
    action: "Open the evaluator",
    href: "/evidence",
  },
  {
    name: "Practice desk",
    description: "Operating functions, SOPs, controls, and metrics for a dental practice.",
    action: "Open the reference",
    href: "/practice",
  },
];

function BlakeGPTHome() {
  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="flex flex-col gap-2">
        <p className="border-l-2 border-coral pl-2 text-xs font-semibold tracking-[0.2em] text-muted uppercase">
          BlakeGPT
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Choose a helpful next step
        </h1>
        <p className="text-sm text-muted">
          Welcome, Amanda. Your practice has a clear place to begin.
        </p>
      </header>

      <section className="mt-10 grid items-center gap-8 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-12 sm:p-10">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">A calm workspace for the practice</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Open a module to review internal controls, run a focused check, or find a cited rule.
            Each link takes you to that module; your saved Precog records stay in place.
          </p>
        </div>
        <img
          src="/reverie/reverie-friendly-face.webp"
          alt="Reverie smiles in welcome."
          width={512}
          height={512}
          className="mx-auto size-32 object-contain sm:size-40"
        />
      </section>

      <section
        aria-label="BlakeGPT modules"
        className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-5"
      >
        {modules.map((module) => (
          <article
            key={module.name}
            className="flex min-h-64 flex-col rounded-2xl border border-border bg-surface p-6 shadow-sm"
          >
            <h2 className="text-xl font-semibold tracking-tight">{module.name}</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-muted">{module.description}</p>
            {module.name === "Frontier GRC" ? (
              voyagerTab ? (
                <Link
                  to="/"
                  search={{ tab: voyagerTab }}
                  className={`${buttonClass({ variant: "secondary" })} mt-6 w-fit`}
                >
                  {module.action}
                </Link>
              ) : null
            ) : (
              <Link
                to={module.href}
                className={`${buttonClass({ variant: "secondary" })} mt-6 w-fit`}
              >
                {module.action}
              </Link>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
