namespace RAQIB.Core.DTOs;

// ── Auth ─────────────────────────────────────────────────────
public record RegisterDto(string FullName, string Email, string Password);
public record LoginDto(string Email, string Password);
public record AuthResultDto(string Token, string UserId, string FullName, string Role, DateTime Expires);

// ── OTP ──────────────────────────────────────────────────────
public record VerifyOtpDto(string UserId, string Otp);
public record ResendOtpDto(string Email);

// ── Google OAuth (NEW) ───────────────────────────────────────
public record GoogleLoginDto(string IdToken);
public record CompleteGoogleSignupDto(string Ticket, string Password);

// ── Report Create ─────────────────────────────────────────────
public record CreateReportDto(
    string Message,
    double Latitude,
    double Longitude,
    string? Governorate,
    string? Area,
    string? Street,
    string? Address
);

// ── Report Response ───────────────────────────────────────────
public record ReportResponseDto(
    int Id,
    string UserName,
    string UserId,
    string ImagePath,
    string Message,
    double Latitude,
    double Longitude,
    string? Governorate,
    string? Area,
    string? Street,
    string? Address,
    string? PredictedClass,
    string? SeverityLabel,
    int SeverityScore,
    double Confidence,
    double DamagePercentage,
    double AiSeverityScore,
    string? AiReply,
    string Status,
    DateTime CreatedAt
);

// ── Chat ──────────────────────────────────────────────────────
public record ChatMessageDto(string Role, string Content);

public record SendChatDto(int ReportId, string UserMessage);

public record ChatResponseDto(string Reply, List<ChatMessageDto> History);

// ── AI Agent ─────────────────────────────────────────────────
public record AiPredictionDto(
    string PredictedClass,
    string SeverityLabel,
    int SeverityScore,
    double Confidence,
    double DamagePercentage,
    double AiSeverityScore,
    string AiReply,
    Dictionary<string, double> AllProbs,
    Dictionary<string, object> Metrics
);

// ── Map ──────────────────────────────────────────────────────
public record MapPointDto(
    int ReportId,
    double Latitude,
    double Longitude,
    string PredictedClass,
    string SeverityLabel,
    int SeverityScore,
    int CountInArea,
    string? Governorate,
    string? Area,
    DateTime CreatedAt
);

// ── Dashboard (Admin) ─────────────────────────────────────────
public record DashboardStatsDto(
    int TotalReports,
    int PendingReports,
    int ResolvedReports,
    int HighSeverityReports,
    Dictionary<string, int> CountByClass,
    Dictionary<string, int> CountByDay,
    Dictionary<string, int> CountByGovernorate   // للـ Power BI
);

// ── Notifications (NEW) ────────────────────────────────────────
public record NotificationDto(
    int Id,
    int? ReportId,
    string Title,
    string Message,
    string Type,
    bool IsRead,
    DateTime CreatedAt
);

// ── PDF Analytics Report (NEW) ─────────────────────────────────
public record PdfReportRequestDto(
    string? Governorate,   // null/"" = all governorates
    DateTime? FromDate,
    DateTime? ToDate
);
