"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  tienda: { label: "Tienda", color: "#E96A9E" },
  pos: { label: "POS", color: "#D9A441" },
} satisfies ChartConfig;

export function GraficaVentas({
  datos,
}: {
  datos: { fecha: string; tienda: number; pos: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="max-h-80 w-full">
      <BarChart data={datos}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="tienda" fill="var(--color-tienda)" radius={4} />
        <Bar dataKey="pos" fill="var(--color-pos)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
