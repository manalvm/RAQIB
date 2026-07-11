using Microsoft.EntityFrameworkCore;
using RAQIB.Core.DTOs;
using RAQIB.Core.Interfaces;
using RAQIB.Core.Models;
using RAQIB.Infrastructure.Data;

namespace RAQIB.Infrastructure.Repositories;

public class ReportRepository : IReportRepository
{
    private readonly AppDbContext _db;

    public ReportRepository(AppDbContext db) => _db = db;

    public async Task<Report> CreateAsync(Report report)
    {
        _db.Reports.Add(report);
        await _db.SaveChangesAsync();
        return report;
    }

    public async Task<Report?> GetByIdAsync(int id) =>
        await _db.Reports.Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);

    public async Task<IEnumerable<Report>> GetByUserIdAsync(string userId) =>
        await _db.Reports
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<Report>> GetAllAsync() =>
        await _db.Reports
            .Include(r => r.User)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

    public async Task UpdateAsync(Report report)
    {
        _db.Reports.Update(report);
        await _db.SaveChangesAsync();
    }

    public async Task<IEnumerable<MapPointDto>> GetMapPointsAsync(string? userId = null)
    {
        var query = _db.Reports.Where(r => r.PredictedClass != null);

        // لو userId اتبعت (خريطة اليوزر الخاصة)، فلتر على بلاغاته هو بس.
        // لو مفيش userId (خريطة الأدمن)، رجّع كل البلاغات زي ما هي.
        if (!string.IsNullOrEmpty(userId))
        {
            query = query.Where(r => r.UserId == userId);
        }

        var reports = await query
            .Select(r => new
            {
                r.Id,
                r.Latitude,
                r.Longitude,
                r.PredictedClass,
                r.SeverityLabel,
                r.SeverityScore,
                r.CreatedAt,
                r.Governorate,
                r.Area
            }).ToListAsync();

        var result = reports.Select(r => new MapPointDto(
            r.Id,
            r.Latitude,
            r.Longitude,
            r.PredictedClass!,
            r.SeverityLabel ?? "",
            r.SeverityScore,
            CountNearby(reports.Select(x => (x.Latitude, x.Longitude)).ToList(),
                        r.Latitude, r.Longitude),
            r.Governorate,
            r.Area,
            r.CreatedAt
        ));

        return result;
    }

    public async Task<int> GetReportCountInAreaAsync(double lat, double lng, double radiusKm = 0.5) =>
        await _db.Reports.CountAsync(r =>
            Math.Abs(r.Latitude - lat) < radiusKm / 111.0 &&
            Math.Abs(r.Longitude - lng) < radiusKm / 111.0);

    public async Task<DashboardStatsDto> GetDashboardStatsAsync()
    {
        var total = await _db.Reports.CountAsync();
        var pending = await _db.Reports.CountAsync(r => r.Status == ReportStatus.Pending);
        var resolved = await _db.Reports.CountAsync(r => r.Status == ReportStatus.Resolved);
        var highSev = await _db.Reports.CountAsync(r => r.SeverityScore >= 3);

        var byClass = await _db.Reports
            .Where(r => r.PredictedClass != null)
            .GroupBy(r => r.PredictedClass!)
            .Select(g => new { Class = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Class, x => x.Count);

        var since = DateTime.UtcNow.AddDays(-7);
        var byDay = await _db.Reports
            .Where(r => r.CreatedAt >= since)
            .GroupBy(r => r.CreatedAt.Date)
            .Select(g => new { Day = g.Key.ToString("yyyy-MM-dd"), Count = g.Count() })
            .ToDictionaryAsync(x => x.Day, x => x.Count);

        // إحصائيات لكل محافظة
        var byGov = await _db.Reports
            .Where(r => r.Governorate != null)
            .GroupBy(r => r.Governorate!)
            .Select(g => new { Gov = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Gov, x => x.Count);

        return new DashboardStatsDto(total, pending, resolved, highSev, byClass, byDay, byGov);
    }

    private static int CountNearby(List<(double lat, double lng)> all, double lat, double lng)
    {
        const double threshold = 0.005;
        return all.Count(p => Math.Abs(p.lat - lat) < threshold && Math.Abs(p.lng - lng) < threshold);
    }
}