"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  ventas: { label: "Ventas", color: "#E96A9E" },
  costo_productos: { label: "Costo de productos", color: "#D9A441" },
  gastos: { label: "Gastos", color: "#6E2A44" },
  ganancia: { label: "Ganancia", color: "#F29DB8" },
} satisfies ChartConfig;

export function GraficaGanancia({
  datos,
}: {
  datos: {
    fecha: string;
    ventas: number;
    costo_productos: number;
    gastos: number;
    ganancia: number;
  }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="max-h-80 w-full">
      <LineChart data={datos}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          dataKey="ventas"
          stroke="var(--color-ventas)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="costo_productos"
          stroke="var(--color-costo_productos)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="gastos"
          stroke="var(--color-gastos)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="ganancia"
          stroke="var(--color-ganancia)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
