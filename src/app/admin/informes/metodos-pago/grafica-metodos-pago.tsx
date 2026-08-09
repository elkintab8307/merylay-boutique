"use client";

import { Cell, Pie, PieChart } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const PALETA = ["#E96A9E", "#D9A441", "#F29DB8", "#F5B7C8", "#6E2A44"];

export function GraficaMetodosPago({
  datos,
}: {
  datos: { metodo: string; total: number }[];
}) {
  const chartConfig = Object.fromEntries(
    datos.map((d, i) => [
      d.metodo,
      { label: d.metodo, color: PALETA[i % PALETA.length] },
    ]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square max-h-80"
    >
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="metodo" />} />
        <Pie data={datos} dataKey="total" nameKey="metodo" innerRadius={60}>
          {datos.map((d, i) => (
            <Cell key={d.metodo} fill={PALETA[i % PALETA.length]} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="metodo" />} />
      </PieChart>
    </ChartContainer>
  );
}
