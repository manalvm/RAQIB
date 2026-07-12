import React from "react";
import { Card, CardContent, Stack, Typography, Box } from "@mui/material";

export default function DashboardCard({ title, subtitle, icon, actions, children, sx = {}, ...props }) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3.5,
        background: "linear-gradient(135deg, rgba(39, 68, 110, 0.44) 0%, rgba(13, 31, 53, 0.84) 100%)",
        border: "1px solid rgba(200, 205, 214, 0.16)",
        boxShadow: "0 18px 42px rgba(2, 8, 23, 0.24)",
        backdropFilter: "blur(12px)",
        color: "#fff",
        transition: "transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 24px 54px rgba(2, 8, 23, 0.32)",
          borderColor: "rgba(242, 140, 40, 0.24)",
        },
        ...sx,
      }}
      {...props}
    >
      <CardContent sx={{ p: { xs: 1.9, md: 2.3 } }}>
        {(title || subtitle || icon || actions) && (
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ mb: 1.75 }}>
            <Box>
              {title && (
                <Typography variant="h6" sx={{ fontWeight: 800, color: "#fff", mb: 0.35, letterSpacing: "0.01em", fontSize: "1.05rem" }}>
                  {title}
                </Typography>
              )}
              {subtitle && (
                <Typography variant="body2" sx={{ color: "#C8CDD6", lineHeight: 1.5, fontSize: "0.82rem" }}>
                  {subtitle}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              {icon && (
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(242, 140, 40, 0.14)",
                    border: "1px solid rgba(242, 140, 40, 0.2)",
                    color: "#F28C28",
                  }}
                >
                  {icon}
                </Box>
              )}
              {actions}
            </Stack>
          </Stack>
        )}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}
