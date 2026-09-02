export function SearchBox({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/feed" role="search" className="w-full max-w-sm">
      <label htmlFor="feed-search" className="sr-only">
        Search posts
      </label>
      <input
        id="feed-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search posts"
        className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
      />
    </form>
  );
}
