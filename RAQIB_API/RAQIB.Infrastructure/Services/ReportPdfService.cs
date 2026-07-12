using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using RAQIB.Core.DTOs;
using RAQIB.Core.Interfaces;
using RAQIB.Core.Models;

namespace RAQIB.Infrastructure.Services;

// NOTE: requires the "QuestPDF" NuGet package.
// Add once at app startup (e.g. Program.cs):  QuestPDF.Settings.License = LicenseType.Community;
public class ReportPdfService : IReportPdfService
{
    private readonly IReportRepository _repo;

    private static readonly string Navy = "#0b1c33";
    private static readonly string NavyCard = "#17325A";
    private static readonly string NavySecondary = "#27446E";
    private static readonly string Orange = "#F28C28";
    private static readonly string OrangeDark = "#E57200";
    private static readonly string Gray = "#C8CDD6";
    private static readonly string White = "#FFFFFF";
    private static readonly string Critical = "#D1453B";
    private static readonly string Success = "#34C759";

    private static readonly Dictionary<string, string> ClassAr = new()
    {
        ["Damaged Road"] = "طريق تالف",
        ["Normal Road"] = "طريق سليم",
        ["Damaged Home"] = "مبنى متضرر",
        ["Normal Building"] = "مباني سليمة",
        ["Big Trash"] = "نفايات كبيرة",
        ["Small Trash"] = "نفايات صغيرة",
    };

    public ReportPdfService(IReportRepository repo) => _repo = repo;

    public async Task<byte[]> GeneratePdfReportAsync(PdfReportRequestDto request)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var all = (await _repo.GetAllAsync()).ToList();

        var filtered = all.Where(r =>
            (string.IsNullOrWhiteSpace(request.Governorate) || r.Governorate == request.Governorate) &&
            (!request.FromDate.HasValue || r.CreatedAt.Date >= request.FromDate.Value.Date) &&
            (!request.ToDate.HasValue || r.CreatedAt.Date <= request.ToDate.Value.Date)
        ).ToList();

        var stats = BuildStats(filtered);
        var scopeLabel = string.IsNullOrWhiteSpace(request.Governorate) ? "كل المحافظات" : request.Governorate!;
        var rangeLabel = (request.FromDate, request.ToDate) switch
        {
            (not null, not null) => $"{request.FromDate:yyyy-MM-dd} → {request.ToDate:yyyy-MM-dd}",
            (not null, null) => $"من {request.FromDate:yyyy-MM-dd}",
            (null, not null) => $"حتى {request.ToDate:yyyy-MM-dd}",
            _ => "كل الفترات",
        };

        var document = Document.Create(container =>
        {
            ComposeCoverPage(container, scopeLabel, rangeLabel, stats);
            ComposeSummaryPage(container, stats);
            ComposeGovernoratePage(container, stats);
            ComposeCategorySeverityPage(container, stats);
            ComposeInsightsPage(container, stats);
        });

        return document.GeneratePdf();
    }

    // ── Stats model ─────────────────────────────────────────────
    private class Stats
    {
        public int Total, Pending, InProgress, Resolved, Rejected, HighSeverity;
        public double ResolutionRate;
        public List<(string Name, int Count)> ByGovernorate = new();
        public List<(string Name, int Count)> ByClass = new();
        public List<(string Label, int Count, string Color)> BySeverity = new();
        public DateTime GeneratedAt = DateTime.UtcNow;
    }

    private Stats BuildStats(List<Report> reports)
    {
        var s = new Stats { Total = reports.Count };
        s.Pending = reports.Count(r => r.Status == ReportStatus.Pending);
        s.InProgress = reports.Count(r => r.Status == ReportStatus.InProgress);
        s.Resolved = reports.Count(r => r.Status == ReportStatus.Resolved);
        s.Rejected = reports.Count(r => r.Status == ReportStatus.Rejected);
        s.HighSeverity = reports.Count(r => r.SeverityScore >= 3);
        s.ResolutionRate = s.Total == 0 ? 0 : (double)s.Resolved / s.Total * 100.0;

        s.ByGovernorate = reports
            .Where(r => !string.IsNullOrWhiteSpace(r.Governorate))
            .GroupBy(r => r.Governorate!)
            .Select(g => (Name: g.Key, Count: g.Count()))
            .OrderByDescending(x => x.Count)
            .ToList();

        s.ByClass = reports
            .Where(r => !string.IsNullOrWhiteSpace(r.PredictedClass))
            .GroupBy(r => r.PredictedClass!)
            .Select(g => (Name: ClassAr.TryGetValue(g.Key, out var ar) ? ar : g.Key, Count: g.Count()))
            .OrderByDescending(x => x.Count)
            .ToList();

        s.BySeverity = new List<(string, int, string)>
        {
            ("عالية", reports.Count(r => r.SeverityScore == 3), Critical),
            ("متوسطة", reports.Count(r => r.SeverityScore == 2), OrangeDark),
            ("منخفضة", reports.Count(r => r.SeverityScore == 1), Orange),
            ("منعدمة", reports.Count(r => r.SeverityScore <= 0), NavySecondary),
        };

        return s;
    }

    // ── Page 1: Cover ────────────────────────────────────────────
    private void ComposeCoverPage(IDocumentContainer container, string scope, string range, Stats s)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(0);
            page.Background(Navy);

            // NEW: RTL must be chained together with the content that's actually
            // attached to the page — calling page.Content() a second time (as the
            // old code did) silently drops whatever was configured on the first,
            // unused call and falls back to left-to-right.
            page.Content().ContentFromRightToLeft().Column(col =>
            {
                col.Item().PaddingTop(140).AlignCenter().Text("🌿").FontSize(52);
                col.Item().PaddingTop(12).AlignCenter().Text("RAQIB").FontSize(42).Bold().FontColor(Orange);
                col.Item().AlignCenter().Text("تقرير التحليلات الذكية").FontSize(20).FontColor(White);
                col.Item().PaddingTop(4).AlignCenter().Text("Business Intelligence Report").FontSize(11).FontColor(Gray);

                col.Item().PaddingTop(60).AlignCenter().Width(360).Column(inner =>
                {
                    inner.Item().Background(NavyCard).Padding(18).Column(box =>
                    {
                        Row3(box, "نطاق التقرير", scope, "الفترة الزمنية", range);
                        box.Item().PaddingTop(10).AlignRight().Text($"تاريخ إصدار التقرير: {s.GeneratedAt:yyyy-MM-dd HH:mm} UTC")
                            .FontSize(10).FontColor(Gray);
                    });
                });

                col.Item().PaddingTop(50).AlignCenter().Text($"{s.Total}").FontSize(56).Bold().FontColor(Orange);
                col.Item().AlignCenter().Text("إجمالي البلاغات ضمن هذا النطاق").FontSize(12).FontColor(Gray);

                col.Item().PaddingTop(160).AlignCenter().Text("تقرير آلي مُولّد بواسطة نظام RAQIB لإدارة البلاغات البيئية")
                    .FontSize(9).FontColor(Gray);
            });
        });
    }

    private void Row3(ColumnDescriptor box, string l1, string v1, string l2, string v2)
    {
        box.Item().Row(row =>
        {
            row.RelativeItem().Column(c =>
            {
                c.Item().AlignRight().Text(l1).FontSize(9).FontColor(Gray);
                c.Item().AlignRight().Text(v1).FontSize(13).Bold().FontColor(White);
            });
            row.RelativeItem().Column(c =>
            {
                c.Item().AlignRight().Text(l2).FontSize(9).FontColor(Gray);
                c.Item().AlignRight().Text(v2).FontSize(13).Bold().FontColor(White);
            });
        });
    }

    // ── Page 2: Executive summary ───────────────────────────────
    private void ComposeSummaryPage(IDocumentContainer container, Stats s)
    {
        container.Page(page =>
        {
            SetupPage(page);
            // NEW: single chained call — see note in ComposeCoverPage above.
            page.Content().ContentFromRightToLeft().Column(col =>
            {
                Header(col, "الملخص التنفيذي", "أهم مؤشرات الأداء خلال الفترة المحددة");

                col.Item().PaddingTop(14).Row(row =>
                {
                    row.RelativeItem().Element(e => KpiCard(e, "إجمالي البلاغات", s.Total.ToString(), NavySecondary));
                    row.RelativeItem().Element(e => KpiCard(e, "قيد الانتظار", s.Pending.ToString(), Orange));
                    row.RelativeItem().Element(e => KpiCard(e, "قيد التنفيذ", s.InProgress.ToString(), OrangeDark));
                });
                col.Item().PaddingTop(10).Row(row =>
                {
                    row.RelativeItem().Element(e => KpiCard(e, "تم الحل", s.Resolved.ToString(), Success));
                    row.RelativeItem().Element(e => KpiCard(e, "خطورة عالية", s.HighSeverity.ToString(), Critical));
                    row.RelativeItem().Element(e => KpiCard(e, "نسبة الحل", $"{s.ResolutionRate:F1}%", Orange));
                });

                col.Item().PaddingTop(24).AlignRight().Text("توزيع حالات البلاغات: قيد الانتظار مقابل تم الحل").FontSize(13).Bold().FontColor(White);
                col.Item().PaddingTop(8).Element(e => StatusStackedBar(e, s));

                col.Item().PaddingTop(24).AlignRight().Text("توزيع الخطورة").FontSize(13).Bold().FontColor(White);
                col.Item().PaddingTop(8).Element(e => SeverityBarChart(e, s));

                Footer(col);
            });
        });
    }

    private void KpiCard(IContainer container, string label, string value, string color)
    {
        container.Padding(6).Background(NavyCard).Padding(14).Column(c =>
        {
            c.Item().AlignRight().Text(label).FontSize(9).FontColor(Gray);
            c.Item().PaddingTop(4).AlignRight().Text(value).FontSize(22).Bold().FontColor(color);
            c.Item().PaddingTop(6).Height(4).Background(color);
        });
    }

    private void StatusStackedBar(IContainer container, Stats s)
    {
        var total = Math.Max(s.Total, 1);

        container.Column(col =>
        {
            col.Item().Height(28).Row(row =>
            {
                if (s.Resolved > 0)
                    row.RelativeItem(s.Resolved).Background(Success);

                if (s.InProgress > 0)
                    row.RelativeItem(s.InProgress).Background(OrangeDark);

                if (s.Pending > 0)
                    row.RelativeItem(s.Pending).Background(Orange);

                if (s.Rejected > 0)
                    row.RelativeItem(s.Rejected).Background(Critical);

                var accounted = s.Resolved + s.InProgress + s.Pending + s.Rejected;

                if (accounted < total)
                    row.RelativeItem(total - accounted).Background(NavySecondary);
            });

            col.Item().PaddingTop(6).Row(legend =>
            {
                legend.RelativeItem().Element(e => LegendDot(e, Success, "تم الحل"));
                legend.RelativeItem().Element(e => LegendDot(e, OrangeDark, "قيد التنفيذ"));
                legend.RelativeItem().Element(e => LegendDot(e, Orange, "قيد الانتظار"));
                legend.RelativeItem().Element(e => LegendDot(e, Critical, "مرفوض"));
            });
        });
    }

    private void LegendDot(IContainer container, string color, string label)
    {
        container.Row(row =>
        {
            row.ConstantItem(10).Height(10).Background(color);
            row.RelativeItem().PaddingRight(6).AlignRight().Text(label).FontSize(9).FontColor(Gray);
        });
    }

    private void SeverityBarChart(IContainer container, Stats s)
    {
        var max = Math.Max(s.BySeverity.Max(x => x.Count), 1);
        container.Column(col =>
        {
            foreach (var (label, count, color) in s.BySeverity)
            {
                col.Item().PaddingBottom(8).Row(row =>
                {
                    row.ConstantItem(60).AlignRight().Text(label).FontSize(10).FontColor(Gray);
                    row.RelativeItem().Height(16).Background("#132B4A").Row(barRow =>
                    {
                       var ratio = (float)count / max;
                        ratio = Math.Clamp(ratio, 0.001f, 1f);

                        barRow.RelativeItem(ratio).Background(color);

                        if (ratio < 1f)
                        {
                            barRow.RelativeItem(1f - ratio);
                        }
                    });
                    row.ConstantItem(36).AlignRight().Text(count.ToString()).FontSize(10).FontColor(White);
                });
            }
        });
    }

    // ── Page 3: Governorate breakdown ───────────────────────────
    private void ComposeGovernoratePage(IDocumentContainer container, Stats s)
    {
        container.Page(page =>
        {
            SetupPage(page);
            // NEW: single chained call — see note in ComposeCoverPage above.
            page.Content().ContentFromRightToLeft().Column(col =>
            {
                Header(col, "البلاغات حسب المحافظة", "أعلى المحافظات من حيث عدد البلاغات المسجلة");

                col.Item().PaddingTop(14).Element(e => TopBarList(e, s.ByGovernorate.Take(10).ToList()));

                col.Item().PaddingTop(24).AlignRight().Text("جدول الإحصائيات الكامل").FontSize(13).Bold().FontColor(White);
                col.Item().PaddingTop(8).Element(e => DataTable(e, "المحافظة", s.ByGovernorate, s.Total));

                Footer(col);
            });
        });
    }

    private void TopBarList(IContainer container, List<(string Name, int Count)> data)
    {
        if (data.Count == 0)
        {
            container.AlignRight().Text("لا توجد بيانات كافية لهذا النطاق.")
                .FontSize(11)
                .FontColor(Gray);
            return;
        }

        var max = Math.Max(data.Max(x => x.Count), 1);

        container.Column(col =>
        {
            foreach (var (name, count) in data)
            {
                col.Item().PaddingBottom(8).Row(row =>
                {
                    row.ConstantItem(90).AlignRight().Text(name).FontSize(10).FontColor(Gray);

                    row.RelativeItem().Height(16).Background("#132B4A").Row(barRow =>
                    {
                        var ratio = (float)count / max;
                        ratio = Math.Clamp(ratio, 0.001f, 1f);

                        barRow.RelativeItem(ratio).Background(Orange);

                        if (ratio < 1f)
                        {
                            barRow.RelativeItem(1f - ratio);
                        }
                    });

                    row.ConstantItem(30)
                        .AlignRight()
                        .Text(count.ToString())
                        .FontSize(10)
                        .FontColor(White);
                });
            }
        });
    }

    private void DataTable(IContainer container, string firstColumnTitle, List<(string Name, int Count)> data, int total)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                c.RelativeColumn(3);
                c.RelativeColumn(1);
                c.RelativeColumn(1);
            });

            table.Header(h =>
            {
                HeaderCell(h.Cell(), firstColumnTitle);
                HeaderCell(h.Cell(), "عدد البلاغات");
                HeaderCell(h.Cell(), "النسبة");
            });

            foreach (var (name, count) in data)
            {
                var pct = total == 0 ? 0 : (double)count / total * 100.0;
                BodyCell(table.Cell(), name);
                BodyCell(table.Cell(), count.ToString());
                BodyCell(table.Cell(), $"{pct:F1}%");
            }
        });
    }

    private void HeaderCell(IContainer container, string text) =>
        container
            .Background(NavySecondary)
            .Padding(6)
            .AlignRight()
            .Text(text)
            .FontSize(10)
            .Bold()
            .FontColor(White);

    private void BodyCell(IContainer container, string text) =>
        container
            .BorderBottom(1)
            .BorderColor("#1e3a5f")
            .Padding(6)
            .AlignRight()
            .Text(text)
            .FontSize(10)
            .FontColor(Gray);

    // ── Page 4: Category + severity ─────────────────────────────
    private void ComposeCategorySeverityPage(IDocumentContainer container, Stats s)
    {
        container.Page(page =>
        {
            SetupPage(page);
            // NEW: single chained call — see note in ComposeCoverPage above.
            page.Content().ContentFromRightToLeft().Column(col =>
            {
                Header(col, "البلاغات حسب الفئة", "أنواع المشكلات الأكثر تكراراً");
                col.Item().PaddingTop(14).Element(e => TopBarList(e, s.ByClass.Take(8).ToList()));

                col.Item().PaddingTop(24).AlignRight().Text("جدول تفصيلي للفئات").FontSize(13).Bold().FontColor(White);
                col.Item().PaddingTop(8).Element(e => DataTable(e, "نوع المشكلة", s.ByClass, s.Total));

                Footer(col);
            });
        });
    }

    // ── Page 5: AI insights ──────────────────────────────────────
    private void ComposeInsightsPage(IDocumentContainer container, Stats s)
    {
        var insights = BuildInsights(s);

        container.Page(page =>
        {
            SetupPage(page);
            // NEW: single chained call — see note in ComposeCoverPage above.
            page.Content().ContentFromRightToLeft().Column(col =>
            {
                Header(col, "الاستنتاجات والتوصيات الذكية", "تحليل آلي مبني على بيانات البلاغات الحالية");

                col.Item().PaddingTop(14).Column(list =>
                {
                    foreach (var insight in insights)
                    {
                        list.Item().PaddingBottom(10).Background(NavyCard).Padding(12).Row(row =>
                        {
                            row.ConstantItem(28).Text(insight.Icon).FontSize(16);
                            row.RelativeItem().PaddingRight(8).AlignRight().Text(insight.Text).FontSize(11).FontColor(White);
                        });
                    }
                });

                col.Item().PaddingTop(30).AlignRight().Text("أعلى المحافظات تأثراً").FontSize(13).Bold().FontColor(White);
                col.Item().PaddingTop(8).Element(e => TopBarList(e, s.ByGovernorate.Take(5).ToList()));

                Footer(col);
            });
        });
    }

    private List<(string Icon, string Text)> BuildInsights(Stats s)
    {
        var list = new List<(string, string)>();
        if (s.Total == 0)
        {
            list.Add(("ℹ️", "لا توجد بيانات كافية ضمن هذا النطاق لاستخلاص استنتاجات."));
            return list;
        }

        if ((double)s.HighSeverity / s.Total >= 0.25)
            list.Add(("", $"نسبة البلاغات عالية الخطورة مرتفعة ({(double)s.HighSeverity / s.Total * 100:F0}%) — يُنصح بتخصيص فرق متابعة إضافية."));
        else
            list.Add(("", "نسبة البلاغات عالية الخطورة ضمن حدود مقبولة."));

        if (s.ResolutionRate < 50)
            list.Add(("", $"نسبة حل البلاغات ({s.ResolutionRate:F1}%) أقل من المستهدف — يُنصح بمراجعة سرعة الاستجابة."));
        else
            list.Add(("", $"نسبة حل البلاغات جيدة ({s.ResolutionRate:F1}%)، استمرار الأداء الحالي موصى به."));

        var topGov = s.ByGovernorate.FirstOrDefault();
        if (topGov.Name != null)
            list.Add(("📍", $"محافظة {topGov.Name} تسجل أعلى عدد بلاغات ({topGov.Count}) — قد تحتاج تدخلاً ميدانياً مُركّزاً."));

        var topClass = s.ByClass.FirstOrDefault();
        if (topClass.Name != null)
            list.Add(("", $"الفئة الأكثر تكراراً هي \"{topClass.Name}\" ({topClass.Count} بلاغ) — يُنصح بمعالجة السبب الجذري لهذه الفئة."));

        if (s.Pending > s.Resolved)
            list.Add(("", "عدد البلاغات قيد الانتظار يفوق عدد البلاغات المحلولة — يُنصح بزيادة سرعة المعالجة."));

        return list;
    }

    // ── Shared layout helpers ────────────────────────────────────
    private void SetupPage(PageDescriptor page)
    {
        page.Size(PageSizes.A4);
        page.Margin(28);
        page.Background(Navy);

        page.DefaultTextStyle(t =>
            t.FontFamily("Arial")
            .FontColor(White));

        // NOTE: RTL is intentionally NOT set here anymore. It must be chained
        // directly with page.Content()'s .Column(...) call in each Compose*Page
        // method below — calling page.Content() a second time to attach content
        // (as the old code did) creates a brand-new, left-to-right container and
        // silently discards whatever direction was configured on this first call.
    }

    private void Header(ColumnDescriptor col, string title, string subtitle)
    {
        col.Item().Row(row =>
        {
            row.RelativeItem().Column(c =>
            {
                c.Item().AlignRight().Text("RAQIB").FontSize(11).Bold().FontColor(Orange);
                c.Item().AlignRight().Text(title).FontSize(20).Bold().FontColor(White);
                c.Item().AlignRight().Text(subtitle).FontSize(10).FontColor(Gray);
            });
        });
        col.Item().PaddingTop(8).Height(2).Background(Orange);
    }

    private void Footer(ColumnDescriptor col)
    {
        col.Item().PaddingTop(20).Height(1).Background("#1e3a5f");
        col.Item().PaddingTop(6).Row(row =>
        {
            row.RelativeItem().AlignRight().Text("RAQIB — نظام إدارة البلاغات البيئية").FontSize(8).FontColor(Gray);
            row.RelativeItem().AlignLeft().Text($"صُدر بتاريخ {DateTime.UtcNow:yyyy-MM-dd}").FontSize(8).FontColor(Gray);
        });
    }
}