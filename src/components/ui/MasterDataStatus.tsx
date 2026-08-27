export function MasterDataLoading({ label = "Loading reference data…" }: { label?: string }) {
  return <p className="text-sm text-steel-500">{label}</p>;
}

export function MasterDataError({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-danger-50 bg-danger-50 px-3 py-2 text-sm text-danger-700">
      {message}
    </p>
  );
}

export function MasterDataEmpty({ label }: { label: string }) {
  return <p className="text-sm text-steel-500">{label}</p>;
}
