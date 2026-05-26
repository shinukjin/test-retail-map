export function ExperimentChrome({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 px-3 py-4 sm:px-4 lg:px-6">
      <header className="shrink-0 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50">
          {title}
        </h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
