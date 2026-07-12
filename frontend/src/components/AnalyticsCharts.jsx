import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";

const palette = ["#F28C28", "#E57200", "#4F8EF7", "#34C759", "#D1453B", "#7E57C2"];

export function StatChip({ label, value, color = "#F28C28" }) {
  return (
    <Box
      sx={{
        p: 1.6,
        borderRadius: 2.6,
        background: "linear-gradient(135deg, rgba(13,31,53,0.82) 0%, rgba(39,68,110,0.28) 100%)",
        border: "1px solid rgba(200,205,214,0.14)",
        boxShadow: "0 10px 24px rgba(2, 8, 23, 0.18)",
      }}
    >
      <Typography variant="caption" sx={{ color: "#C8CDD6", display: "block", mb: 0.5, fontSize: "0.72rem" }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, color: "#fff", fontSize: "1.05rem" }}>
        {value}
      </Typography>
      <Box sx={{ mt: 0.75, width: 24, height: 3.5, borderRadius: 999, background: color }} />
    </Box>
  );
}

function ChartFrame({ children }) {
  return (
    <Box
      sx={{
        width: "100%",
        height: 264,
        borderRadius: 3,
        background: "linear-gradient(180deg, rgba(13,31,53,0.64) 0%, rgba(13,31,53,0.3) 100%)",
        border: "1px solid rgba(200,205,214,0.12)",
        p: { xs: 0.75, sm: 1 },
      }}
    >
      {children}
    </Box>
  );
}

export function GovernorateBarChart({ data }) {
  return (
    <ChartFrame>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#C8CDD6", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#C8CDD6", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(242,140,40,0.08)" }} contentStyle={{ background: "#0d1f35", border: "1px solid rgba(200,205,214,0.16)", borderRadius: 12 }} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#F28C28" maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SeverityPieChart({ data }) {
  return (
    <ChartFrame>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={100} paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={`cell-${entry.name}`} fill={palette[index % palette.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "#0d1f35", border: "1px solid rgba(200,205,214,0.16)", borderRadius: 12 }} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function TimelineChart({ data }) {
  return (
    <ChartFrame>
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="timelineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F28C28" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#F28C28" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#C8CDD6", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#C8CDD6", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "#0d1f35", border: "1px solid rgba(200,205,214,0.16)", borderRadius: 12 }} />
          <Area type="monotone" dataKey="value" stroke="#F28C28" fill="url(#timelineGradient)" strokeWidth={2.6} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function CategoryBarChart({ data }) {
  return (
    <ChartFrame>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#C8CDD6", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#C8CDD6", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "#0d1f35", border: "1px solid rgba(200,205,214,0.16)", borderRadius: 12 }} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#4F8EF7" maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function InsightPill({ label, value, icon }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.1}
      sx={{
        p: 1.1,
        borderRadius: 2.25,
        background: "linear-gradient(135deg, rgba(13,31,53,0.82) 0%, rgba(39,68,110,0.28) 100%)",
        border: "1px solid rgba(200,205,214,0.12)",
        boxShadow: "0 10px 24px rgba(2, 8, 23, 0.16)",
        height: "100%",
      }}
    >
      <Box sx={{ fontSize: 18 }}>{icon}</Box>
      <Box>
        <Typography variant="caption" sx={{ color: "#C8CDD6", display: "block" }}>{label}</Typography>
        <Typography variant="body2" sx={{ color: "#fff", fontWeight: 700 }}>{value}</Typography>
      </Box>
    </Stack>
  );
}
