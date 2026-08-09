"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  qty: { label: "Unidades vendidas", color: "#E96A9E" },
} satisfies ChartConfig;

export function GraficaProductos({
  datos,
}: {
  datos: { nombre: string; qty: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="max-h-96 w-full">
      <BarChart data={datos} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis
          dataKey="nombre"
          type="category"
          tickLine={false}
          axisLine={false}
          width={160}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="qty" fill="var(--color-qty)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
