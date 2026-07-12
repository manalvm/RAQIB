using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using RAQIB.Core.DTOs;
using RAQIB.Core.Interfaces;

namespace RAQIB.Infrastructure.Services;

public class AiAgentService : IAiAgentService
{
    private readonly HttpClient _http;

    public AiAgentService(HttpClient http) => _http = http;

    // ── Predict ──────────────────────────────────────────────
    public async Task<AiPredictionDto> PredictAsync(Stream imageStream, string fileName)
    {
        using var content = new MultipartFormDataContent();
        using var sc = new StreamContent(imageStream);
        sc.Headers.ContentType = new("image/jpeg");
        content.Add(sc, "file", fileName);

        var response = await _http.PostAsync("/predict", content);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        // map Python predict.py output to our DTO
        var predictedClass = json.GetProperty("predicted_class").GetString()!;
        var confidenceRaw = json.GetProperty("confidence_score").GetDouble(); // 0-100 from Python
        var damageRaw = json.GetProperty("damage_percentage").GetDouble();
        var aiSeverityRaw = json.GetProperty("severity_score").GetDouble();   // 0-100
        var severityLabel = json.GetProperty("severity_label").GetString()!;
        var metricsEl = json.GetProperty("metrics");

        // normalize severity label to Arabic
        var severityAr = severityLabel switch
        {
            "High" => "عالية",
            "Medium" => "متوسطة",
            "Low" => "منخفضة",
            _ => "منعدمة"
        };

        // severity 0-3 score
        var severityScore = severityLabel switch
        {
            "High" => 3,
            "Medium" => 2,
            "Low" => 1,
            _ => 0
        };

        // all probabilities
        var allProbs = json.GetProperty("all_probabilities")
            .EnumerateObject()
            .ToDictionary(p => p.Name, p => p.Value.GetDouble());

        // metrics dict
        var metrics = metricsEl.ValueKind == JsonValueKind.Object
            ? metricsEl.EnumerateObject().ToDictionary(p => p.Name, p => (object)p.Value.GetDouble())
            : new Dictionary<string, object>();

        // initial AI reply — use Arabic class name
        var classAr = predictedClass switch
        {
            "Damaged Road" => "طريق تالف",
            "Normal Road" => "طريق سليم",
            "Damaged Home" => "مبنى متضرر",
            "Normal Building" => "مباني سليمة",
            "Big Trash" => "نفايات كبيرة",
            "Small Trash" => "نفايات صغيرة",
            _ => predictedClass
        };

        var deptMsg = severityAr == "عالية"
            ? "سيتم التواصل مع القسم المختص فوراً."
            : severityAr == "متوسطة"
                ? "تم إحالة البلاغ للقسم المختص للمراجعة."
                : "تم تسجيل البلاغ وسيتم متابعته.";

        var aiReply =
            $"تم تحليل الصورة بنجاح.\n\n" +
            $" نوع المشكلة:{classAr}\n" +
            $" درجة الخطورة: {severityAr}\n" +
            $" نسبة الضرر:* {damageRaw:F1}%\n\n" +
            $"{deptMsg}";

        return new AiPredictionDto(
            predictedClass,
            severityAr,
            severityScore,
            confidenceRaw / 100.0,   // normalize to 0-1
            damageRaw,
            aiSeverityRaw,
            aiReply,
            allProbs,
            metrics
        );
    }

    // ── Chat ─────────────────────────────────────────────────
    public async Task<string> ChatAsync(
        object predictionResult,
        string userMessage,
        List<ChatMessageDto> history)
    {
        var payload = new
        {
            prediction_result = predictionResult,
            message = userMessage,
            history = history.Select(h => new { role = h.Role, content = h.Content }).ToList()
        };

        var json = JsonSerializer.Serialize(payload);
        var body = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _http.PostAsync("/chat", body);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        return result.GetProperty("reply").GetString() ?? "معلش، حصل خطأ.";
    }
}