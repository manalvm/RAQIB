using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using RAQIB.Core.DTOs;
using RAQIB.Core.Interfaces;
using RAQIB.Core.Models;

namespace RAQIB.API.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly IReportRepository _repo;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IReportPdfService _pdf;

    public AdminController(IReportRepository repo, UserManager<ApplicationUser> users, IReportPdfService pdf)
    {
        _repo = repo;
        _users = users;
        _pdf = pdf;
    }

    // GET /api/admin/dashboard
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard()
    {
        var stats = await _repo.GetDashboardStatsAsync();
        return Ok(stats);
    }

    // GET /api/admin/reports
    [HttpGet("reports")]
    public async Task<IActionResult> AllReports()
    {
        var reports = await _repo.GetAllAsync();
        return Ok(reports.Select(r => new
        {
            r.Id,
            r.ImagePath,
            r.Message,
            r.Latitude,
            r.Longitude,
            r.Governorate,
            r.Area,
            r.Street,
            r.Address,
            r.PredictedClass,
            r.SeverityLabel,
            r.SeverityScore,
            r.Confidence,
            r.DamagePercentage,
            r.AiSeverityScore,
            r.AiReply,
            Status = r.Status.ToString(),
            r.CreatedAt,
            r.ResolvedAt,
            UserName = r.User?.FullName,
            UserEmail = r.User?.Email,
            UserId = r.UserId,
        }));
    }

    // GET /api/admin/users
    [HttpGet("users")]
    public async Task<IActionResult> AllUsers()
    {
        var users = _users.Users.Select(u => new
        {
            u.Id,
            u.FullName,
            u.Email,
            u.CreatedAt,
            u.IsActive,
            ReportCount = u.Reports.Count
        }).ToList();
        return Ok(users);
    }

    // PATCH /api/admin/users/{id}/toggle
    [HttpPatch("users/{id}/toggle")]
    public async Task<IActionResult> ToggleUser(string id)
    {
        var user = await _users.FindByIdAsync(id);
        if (user == null) return NotFound();
        user.IsActive = !user.IsActive;
        await _users.UpdateAsync(user);
        return Ok(new { user.IsActive });
    }

    // ── NEW: GET /api/admin/reports/pdf?governorate=&fromDate=&toDate= ──
    // بيولّد تقرير PDF احترافي بالتحليلات، ممكن يتصفّى حسب المحافظة و/أو فترة زمنية
    [HttpGet("reports/pdf")]
    public async Task<IActionResult> DownloadPdfReport(
        [FromQuery] string? governorate,
        [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate)
    {
        var request = new PdfReportRequestDto(governorate, fromDate, toDate);
        var bytes = await _pdf.GeneratePdfReportAsync(request);

        var fileName = $"RAQIB-Report-{DateTime.UtcNow:yyyyMMdd-HHmm}.pdf";
        return File(bytes, "application/pdf", fileName);
    }
}