"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NamedCount } from "@/types";

const COLORS = ["#0b5c67", "#123044", "#c4a35a", "#1a4259", "#14808c", "#8a5a12"];
const CHART_SERIES_LIMIT = 12;

export function HorizontalBarChart({ data }: { data: NamedCount[] }) {
  const series = data.slice(0, CHART_SERIES_LIMIT);
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} layout="vertical" margin={{ left: 16, right: 12, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12, fill: "#6b7780" }} />
          <YAxis
            type="category"
            dataKey="name"
            width={128}
            tick={{ fontSize: 11, fill: "#3d4a55" }}
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, borderColor: "#d9e0e5", fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
            {series.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VerticalBarChart({ data }: { data: NamedCount[] }) {
  const series = data.slice(0, CHART_SERIES_LIMIT);
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#3d4a55" }} interval={0} angle={-18} textAnchor="end" height={56} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7780" }} />
          <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#d9e0e5", fontSize: 12 }} />
          <Bar dataKey="value" fill="#0b5c67" radius={[4, 4, 0, 0]} barSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
