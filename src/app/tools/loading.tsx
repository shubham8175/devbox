export default function ToolLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl" aria-busy="true" aria-label="Loading tool">
      <div className="mb-2.5 h-3 w-40 skeleton" />
      <div className="mb-5 flex items-start gap-3.5">
        <div className="h-10 w-10 skeleton" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-56 skeleton" />
          <div className="h-3.5 w-80 max-w-full skeleton" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-48 skeleton" />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-14 skeleton" />
          <div className="h-14 skeleton" />
          <div className="h-14 skeleton" />
          <div className="h-14 skeleton" />
        </div>
      </div>
    </div>
  );
}
