"use client";

export function KpiTile({
  data,
  name,
}: {
  data: { label: string; value: number }[];
  name: string;
}) {
  const value = data[0]?.value ?? 0;
  const formatted = Number.isInteger(value)
    ? value.toLocaleString("es-CL")
    : value.toFixed(2);
  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">{name}</p>
      <p className="text-4xl font-bold mt-2">{formatted}</p>
    </div>
  );
}
