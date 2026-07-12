using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RAQIB.API.Hubs;
using RAQIB.Core.DTOs;
using RAQIB.Core.Interfaces;
using RAQIB.Core.Models;

namespace RAQIB.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ReportsController : ControllerBase
{
    private readonly IReportRepository _repo;
    private readonly IAiAgentService _ai;
    private readonly IImageStorageService _storage;
    private readonly IEmailService _email;
    private readonly NotificationService _notify;
    private readonly INotificationRepository _notifications;
    private readonly IConfiguration _config;

    private static readonly Dictionary<string, string> ClassAr = new()
    {
        ["Damaged Road"] = "طريق تالف",
        ["Normal Road"] = "طريق سليم",
        ["Damaged Home"] = "مبنى متضرر",
        ["Normal Building"] = "مباني سليمة",
        ["Big Trash"] = "نفايات كبيرة",
        ["Small Trash"] = "نفايات صغيرة",
    };

    public ReportsController(
        IReportRepository repo, IAiAgentService ai,
        IImageStorageService storage, IEmailService email,
        NotificationService notify, INotificationRepository notifications,
        IConfiguration config)
    {
        _repo = repo;
        _ai = ai;
        _storage = storage;
        _email = email;
        _notify = notify;
        _notifications = notifications;
        _config = config;
    }

    // ── POST /api/reports ────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromForm] CreateReportDto dto, IFormFile image)
    {
        if (image == null || image.Length == 0)
            return BadRequest("الصورة مطلوبة");

        var allowedTypes = new[] { "image/jpeg", "image/png", "image/webp" };
        if (!allowedTypes.Contains(image.ContentType))
            return BadRequest("نوع الصورة غير مدعوم");

        if (image.Length > 10 * 1024 * 1024)
            return BadRequest("حجم الصورة يتجاوز 10MB");

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var userName = User.FindFirstValue(ClaimTypes.Name) ?? "";

        // 1. حفظ الصورة
        using var stream = image.OpenReadStream();
        var imagePath = await _storage.SaveImageAsync(stream, image.FileName);

        // 2. إرسال للـ AI Agent
        AiPredictionDto prediction;
        try
        {
            using var aiStream = image.OpenReadStream();
            prediction = await _ai.PredictAsync(aiStream, image.FileName);
        }
        catch (TaskCanceledException ex)
        {
            // الـ HttpClient.Timeout انتهى قبل ما الـ FastAPI يرد
            Console.WriteLine($"AI prediction timed out: {ex}");
            _storage.DeleteImage(imagePath); // تنظيف الصورة اللي اتحفظت بدون ما تتحلل
            return StatusCode(504, "تعذر تحليل الصورة، الخدمة استغرقت وقتاً طويلاً. حاول مرة أخرى.");
        }
        catch (Exception ex)
        {
            Console.WriteLine(ex.ToString());
            _storage.DeleteImage(imagePath); // تنظيف الصورة اللي اتحفظت بدون ما تتحلل
            return StatusCode(502, "حدث خطأ أثناء تحليل الصورة.");
        }
        // 3. بناء الـ initial chat history
        var initialHistory = new List<ChatMessageDto>
        {
            new("assistant", prediction.AiReply)
        };

        // 4. حفظ في DB
        var report = new Report
        {
            UserId = userId,
            ImagePath = imagePath,
            Message = dto.Message,
            Latitude = dto.Latitude,
            Longitude = dto.Longitude,
            Governorate = dto.Governorate,
            Area = dto.Area,
            Street = dto.Street,
            Address = dto.Address,
            PredictedClass = prediction.PredictedClass,
            SeverityLabel = prediction.SeverityLabel,
            SeverityScore = prediction.SeverityScore,
            Confidence = prediction.Confidence,
            DamagePercentage = prediction.DamagePercentage,
            AiSeverityScore = prediction.AiSeverityScore,
            AiReply = prediction.AiReply,
            ChatHistoryJson = JsonSerializer.Serialize(initialHistory),
        };

        await _repo.CreateAsync(report);

        // 5. رد فوري عبر SignalR
        var replyPayload = new
        {
            reportId = report.Id,
            predictedClass = prediction.PredictedClass,
            severityLabel = prediction.SeverityLabel,
            severityScore = prediction.SeverityScore,
            confidence = prediction.Confidence,
            damagePercentage = prediction.DamagePercentage,
            aiSeverityScore = prediction.AiSeverityScore,
            aiReply = prediction.AiReply,
            imagePath,
            governorate = dto.Governorate,
            area = dto.Area,
            street = dto.Street,
        };
        await _notify.SendAiReplyAsync(userId, replyPayload);

        // 6. تحديث الخريطة للكل (اليوزر والأدمن كلهم متصلين على نفس الـ hub؛
        // بنبعت الـ UserId في الـ payload عشان الفرونت يقدر يفلتر ويعرض
        // البلاغ ده بس لو هو صاحبه، أو لو الشخص أدمن)
        await _notify.BroadcastMapUpdateAsync(new
        {
            report.Id,
            report.UserId,
            report.Latitude,
            report.Longitude,
            prediction.PredictedClass,
            prediction.SeverityLabel,
            prediction.SeverityScore,
            report.Governorate,
            report.Area,
            report.CreatedAt,
            userName,
        });

        // 7. تنبيه الأدمن + إيميل عند الخطورة العالية
        if (prediction.SeverityScore >= 3)
        {
            await _notify.SendNewReportAlertAsync(new
            {
                reportId = report.Id,
                userName,
                report.Governorate,
                report.Area,
                report.Street,
                report.Latitude,
                report.Longitude,
                prediction.PredictedClass,
                prediction.SeverityLabel,
                prediction.SeverityScore,
                status = "Pending",
                createdAt = report.CreatedAt.ToString("o"),
            });
            var adminEmail = _config["AdminEmail"]!;
            _ = Task.Run(() => _email.SendHighSeverityAlertAsync(report, adminEmail));
        }

        return Ok(MapToDto(report));
    }

    // ── POST /api/reports/chat ───────────────────────────────
    // اليوزر يبعت رسالة جديدة والـ Agent يرد مع الـ history
    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] SendChatDto dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var report = await _repo.GetByIdAsync(dto.ReportId);

        if (report == null) return NotFound();
        if (report.UserId != userId) return Forbid();

        // استرجاع الـ history الموجود
        var history = string.IsNullOrEmpty(report.ChatHistoryJson)
            ? new List<ChatMessageDto>()
            : JsonSerializer.Deserialize<List<ChatMessageDto>>(report.ChatHistoryJson)
              ?? new List<ChatMessageDto>();

        // بناء prediction result object للـ Python agent

    Console.WriteLine("===== REPORT STATUS =====");
    Console.WriteLine(report.Status);
    Console.WriteLine(report.Status.ToString());
       var predictionResult = new
{
    predicted_class = report.PredictedClass,
    confidence_score = report.Confidence * 100,
    damage_percentage = report.DamagePercentage,
    severity_score = report.AiSeverityScore,
    // مشتقة من SeverityScore (نفس المصدر الوحيد للمعلومة المستخدم في
    // الداشبورد والخريطة وتقرير الـ PDF) بدل مطابقة نص عربي، عشان
    // مستوى الخطورة اللي بيوصف للشات يكون مطابق دايمًا لأي مكان تاني
    // بالتطبيق، بما فيها مستوى "منعدمة" اللي كان بيترجم غلط لـ "Low".
    severity_label = report.SeverityScore switch
    {
        3 => "High",
        2 => "Medium",
        1 => "Low",
        _ => "None"
    },

    governorate = report.Governorate,
    area = report.Area,
    street = report.Street,
    address = report.Address,

    report_status = report.Status.ToString(),
    created_at = report.CreatedAt,
    resolved_at = report.ResolvedAt
};

        // إضافة رسالة اليوزر للـ history
        history.Add(new ChatMessageDto("user", dto.UserMessage));

        // استدعاء Python chatbot
        string reply;
        try
        {
            reply = await _ai.ChatAsync(predictionResult, dto.UserMessage, history);
        }
        catch
        {
            reply = "معلش، حصلت مشكلة في الرد. جرب تاني.";
        }

        // إضافة رد الـ AI للـ history
        history.Add(new ChatMessageDto("assistant", reply));

        // حفظ الـ history في DB
        report.ChatHistoryJson = JsonSerializer.Serialize(history);
        await _repo.UpdateAsync(report);

        return Ok(new ChatResponseDto(reply, history));
    }

    // ── GET /api/reports/chat/{reportId} ─────────────────────
    [HttpGet("chat/{reportId:int}")]
    public async Task<IActionResult> GetChatHistory(int reportId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var report = await _repo.GetByIdAsync(reportId);

        if (report == null) return NotFound();
        if (report.UserId != userId && !User.IsInRole("Admin")) return Forbid();

        var history = string.IsNullOrEmpty(report.ChatHistoryJson)
            ? new List<ChatMessageDto>()
            : JsonSerializer.Deserialize<List<ChatMessageDto>>(report.ChatHistoryJson)
              ?? new List<ChatMessageDto>();

        return Ok(history);
    }

    // ── GET /api/reports/my ──────────────────────────────────
    [HttpGet("my")]
    public async Task<IActionResult> GetMy()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var reports = await _repo.GetByUserIdAsync(userId);
        return Ok(reports.Select(MapToDto));
    }

    // ── GET /api/reports/map ─────────────────────────────────
    // الأدمن بيشوف كل البلاغات على الخريطة، اليوزر العادي بيشوف بلاغاته هو بس
    [HttpGet("map")]
    public async Task<IActionResult> GetMapPoints()
    {
        if (User.IsInRole("Admin"))
        {
            var all = await _repo.GetMapPointsAsync();
            return Ok(all);
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var mine = await _repo.GetMapPointsAsync(userId);
        return Ok(mine);
    }

    // ── GET /api/reports/{id} ────────────────────────────────
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var report = await _repo.GetByIdAsync(id);
        if (report == null) return NotFound();

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var isAdmin = User.IsInRole("Admin");
        if (!isAdmin && report.UserId != userId) return Forbid();

        return Ok(MapToDto(report));
    }

    // ── PATCH /api/reports/{id}/status ──────────────────────
    // بيغير حالة البلاغ. لو اتحول لـ Resolved: بيتبعت إشعار فوري + إيميل لليوزر
    [HttpPatch("{id:int}/status")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] string status)
    {
        var report = await _repo.GetByIdAsync(id);
        if (report == null) return NotFound();

        if (!Enum.TryParse<ReportStatus>(status, out var parsed))
            return BadRequest("حالة غير صحيحة");

        var previousStatus = report.Status;
        report.Status = parsed;
        if (parsed == ReportStatus.Resolved)
            report.ResolvedAt = DateTime.UtcNow;

        await _repo.UpdateAsync(report);

        // ── إشعار وإيميل عند تحويل البلاغ لـ "تم الحل" ──
        if (parsed == ReportStatus.Resolved && previousStatus != ReportStatus.Resolved)
        {
            await NotifyResolutionAsync(report);
        }

        return Ok();
    }

    private async Task NotifyResolutionAsync(Report report)
    {
        var classAr = report.PredictedClass != null && ClassAr.TryGetValue(report.PredictedClass, out var ar)
            ? ar
            : report.PredictedClass ?? "المشكلة المبلغ عنها";

        var location = string.Join("، ", new[] { report.Street, report.Area, report.Governorate }
            .Where(part => !string.IsNullOrWhiteSpace(part)));
        if (string.IsNullOrWhiteSpace(location)) location = report.Address ?? "الموقع المسجل";

        var resolvedAt = (report.ResolvedAt ?? DateTime.UtcNow);

        var friendlyMessage =
            $"تم حل بلاغك بخصوص \"{classAr}\" في {location} بتاريخ {resolvedAt:yyyy-MM-dd}. " +
            "لقد قام فريقنا المتخصص بإنجاز العمل المطلوب. شكراً جزيلاً لمساهمتك في الحفاظ على مجتمعنا نظيفاً وآمناً. نقدّر تعاونك حقاً. 🌿";

        // 1. حفظ الإشعار في DB (عشان يظهر في جرس الإشعارات حتى لو اليوزر مش متصل دلوقتي)
        var notification = new Notification
        {
            UserId = report.UserId,
            ReportId = report.Id,
            Title = "تم حل بلاغك ✅",
            Message = friendlyMessage,
            Type = "ReportResolved",
        };
        await _notifications.CreateAsync(notification);

        // 2. إشعار فوري عبر SignalR لجرس الإشعارات
        await _notify.SendNotificationAsync(report.UserId, new NotificationDto(
            notification.Id, notification.ReportId, notification.Title,
            notification.Message, notification.Type, notification.IsRead, notification.CreatedAt));

        // 3. إيميل تأكيد لليوزر (لو الإيميل موجود)
        var toEmail = report.User?.Email;
        var userName = report.User?.FullName ?? "";
        if (!string.IsNullOrWhiteSpace(toEmail))
        {
            _ = Task.Run(() => _email.SendResolutionEmailAsync(report, toEmail!, userName));
        }
    }

    private static ReportResponseDto MapToDto(Report r) => new(
        r.Id,
        r.User?.FullName ?? "",
        r.UserId,
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
        r.Status.ToString(),
        r.CreatedAt
    );
}