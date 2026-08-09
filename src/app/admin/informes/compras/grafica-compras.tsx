"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const PALETA = ["#E96A9E", "#D9A441", "#F29DB8", "#F5B7C8", "#6E2A44"];

export function GraficaCompras({
  datos,
  series,
}: {
  datos: Record<string, number | string>[];
  series: { clave: string; etiqueta: string }[];
}) {
  const chartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.clave,
      { label: s.etiqueta, color: PALETA[i % PALETA.length] },
    ]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="max-h-80 w-full">
      <BarChart data={datos}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) => (
          <Bar
            key={s.clave}
            dataKey={s.clave}
            stackId="a"
            fill={`var(--color-${s.clave})`}
            radius={2}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
