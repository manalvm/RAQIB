using Google.Apis.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.Tokens;
using RAQIB.Core.DTOs;
using RAQIB.Core.Interfaces;
using RAQIB.Core.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace RAQIB.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    // ── OTP policy (Task 2 hardening) ─────────────────────────
    private const int OtpExpiryMinutes    = 10;  // how long a generated code is valid
    private const int OtpCooldownSeconds  = 60;  // minimum gap between two OTP sends
    private const int MaxOtpRequestsPerHour = 5; // caps resend spam / SMTP abuse
    private const int MaxOtpVerifyAttempts  = 5; // caps brute-forcing a 6-digit code

    private readonly UserManager<ApplicationUser> _users;
    private readonly SignInManager<ApplicationUser> _signIn;
    private readonly IConfiguration _config;
    private readonly IEmailService _email;
    private readonly IMemoryCache _cache;

    public AuthController(
        UserManager<ApplicationUser> users,
        SignInManager<ApplicationUser> signIn,
        IConfiguration config,
        IEmailService email,
        IMemoryCache cache)
    {
        _users  = users;
        _signIn = signIn;
        _config = config;
        _email  = email;
        _cache  = cache;
    }

    // ── Shared OTP issuing (rate-limited) ─────────────────────
    // Returns (true, otpCode) on success, or (false, arabicErrorMessage) if the
    // caller is sending requests too fast or has hit the hourly cap. Used by both
    // Register (for the "resend for unverified account" path) and ResendOtp, so a
    // client can't dodge the limit by bouncing between the two endpoints.
    private (bool Ok, string Value) TryIssueOtp(string userId)
    {
        var cooldownKey = $"otp_cooldown_{userId}";
        var attemptsKey = $"otp_attempts_{userId}";

        if (_cache.TryGetValue(cooldownKey, out _))
            return (false, "يرجى الانتظار قليلاً قبل طلب رمز جديد.");

        var attempts = _cache.TryGetValue(attemptsKey, out int a) ? a : 0;
        if (attempts >= MaxOtpRequestsPerHour)
            return (false, "لقد تجاوزت الحد الأقصى لطلبات الرمز. حاول مرة أخرى بعد ساعة.");

        var otp = new Random().Next(100000, 999999).ToString();

        _cache.Set($"otp_{userId}", otp, TimeSpan.FromMinutes(OtpExpiryMinutes));
        _cache.Set(cooldownKey, true, TimeSpan.FromSeconds(OtpCooldownSeconds));
        _cache.Set(attemptsKey, attempts + 1, TimeSpan.FromHours(1));
        _cache.Remove($"otp_fail_{userId}"); // fresh code → reset wrong-attempt counter

        return (true, otp);
    }

    // ── Register ─────────────────────────────────────────────
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterDto dto)
    {
        Console.WriteLine("========== REGISTER ==========");
        Console.WriteLine($"Email: {dto.Email}");
        Console.WriteLine($"Full Name: {dto.FullName}");
        Console.WriteLine("==============================");
        var existing = await _users.FindByEmailAsync(dto.Email);

        Console.WriteLine(existing == null
            ? "User NOT found"
            : $"User FOUND: {existing.Email}");

        if (existing != null)
        {
            // Case: already verified → genuine duplicate.
            if (existing.EmailConfirmed)
                return BadRequest(new[] { "هذا البريد الإلكتروني مستخدم بالفعل." });

            // Case: exists but never verified (e.g. abandoned the OTP step last time).
            // Don't dead-end them — let them correct a typo'd name/password, then
            // resend a fresh OTP (rate-limited so this can't be used to spam the inbox).
            existing.FullName = dto.FullName;
            var nameUpdate = await _users.UpdateAsync(existing);
            if (!nameUpdate.Succeeded)
                return BadRequest(nameUpdate.Errors.Select(e => e.Description));

            if (await _users.HasPasswordAsync(existing))
                await _users.RemovePasswordAsync(existing);

            var pwResult = await _users.AddPasswordAsync(existing, dto.Password);
            if (!pwResult.Succeeded)
                return BadRequest(pwResult.Errors.Select(e => e.Description));

            var (resendOk, resendValue) = TryIssueOtp(existing.Id);
            if (!resendOk)
                return StatusCode(429, new[] { resendValue });

            await _email.SendOtpEmailAsync(existing.Email!, existing.FullName, resendValue);

            return Ok(new { message = "هذا البريد مسجّل بالفعل ولم يتم تأكيده. تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني.", userId = existing.Id });
        }

        var user = new ApplicationUser
        {
            FullName = dto.FullName,
            Email    = dto.Email,
            UserName = dto.Email,
        };

        var result = await _users.CreateAsync(user, dto.Password);
        if (!result.Succeeded)
            return BadRequest(result.Errors.Select(e => e.Description));

        await _users.AddToRoleAsync(user, "User");

        // ── توليد وإرسال أول OTP للمستخدم الجديد ──
        var (ok, value) = TryIssueOtp(user.Id);
        if (!ok)
            return StatusCode(429, new[] { value }); // guard only; unreachable on a brand-new user's fresh cache keys

        await _email.SendOtpEmailAsync(dto.Email, dto.FullName, value);

        return Ok(new { message = "تم إنشاء الحساب. تحقق من بريدك الإلكتروني للحصول على الكود.", userId = user.Id });
    }

    // ── Verify OTP ───────────────────────────────────────────
    [HttpPost("verify-otp")]
    public async Task<IActionResult> VerifyOtp([FromBody] VerifyOtpDto dto)
    {
        var user = await _users.FindByIdAsync(dto.UserId);
        if (user == null)
            return BadRequest(new[] { "مستخدم غير موجود" });

        if (user.EmailConfirmed)
            return Ok(new { message = "البريد الإلكتروني مؤكد بالفعل" }); // idempotent — no need to error here

        var cacheKey = $"otp_{user.Id}";
        var failKey  = $"otp_fail_{user.Id}";

        if (!_cache.TryGetValue(cacheKey, out string? savedOtp))
            return BadRequest(new[] { "انتهت صلاحية الكود، اطلب كوداً جديداً" });

        if (savedOtp != dto.Otp)
        {
            var fails = (_cache.TryGetValue(failKey, out int f) ? f : 0) + 1;

            if (fails >= MaxOtpVerifyAttempts)
            {
                // Burn the code so guessing further is pointless — force a fresh resend.
                _cache.Remove(cacheKey);
                _cache.Remove(failKey);
                return BadRequest(new[] { "تجاوزت الحد الأقصى للمحاولات. يرجى طلب رمز جديد." });
            }

            _cache.Set(failKey, fails, TimeSpan.FromMinutes(OtpExpiryMinutes));
            return BadRequest(new[] { "الكود غير صحيح" });
        }

        // تأكيد الإيميل
        user.EmailConfirmed = true;
        await _users.UpdateAsync(user);

        // احذف الـ OTP ومحاولات الفشل من الـ cache
        _cache.Remove(cacheKey);
        _cache.Remove(failKey);

        return Ok(new { message = "تم تأكيد البريد الإلكتروني بنجاح" });
    }

    // ── Resend OTP ───────────────────────────────────────────
    [HttpPost("resend-otp")]
    public async Task<IActionResult> ResendOtp([FromBody] ResendOtpDto dto)
    {
        var user = await _users.FindByEmailAsync(dto.Email);
        if (user == null)
            return BadRequest(new[] { "البريد الإلكتروني غير موجود" });

        if (user.EmailConfirmed)
            return BadRequest(new[] { "البريد الإلكتروني مؤكد بالفعل" });

        var (ok, value) = TryIssueOtp(user.Id);
        if (!ok)
            return StatusCode(429, new[] { value });

        await _email.SendOtpEmailAsync(dto.Email, user.FullName, value);

        return Ok(new { message = "تم إرسال كود جديد", userId = user.Id });
    }

    // ── Login ────────────────────────────────────────────────
    [HttpPost("login")]
public async Task<IActionResult> Login(LoginDto dto)
{
    var user = await _users.FindByEmailAsync(dto.Email);

    if (user == null)
        return Unauthorized(new[] { "البريد الإلكتروني غير مسجل." });

    if (!user.EmailConfirmed)
        return Unauthorized(new
        {
            message = "يرجى تأكيد البريد الإلكتروني أولاً.",
            needsVerification = true,
            userId = user.Id
        });

    if (!user.IsActive)
        return Unauthorized(new[] { "تم تعطيل هذا الحساب." });

    var result = await _signIn.CheckPasswordSignInAsync(
        user,
        dto.Password,
        lockoutOnFailure: true);

    if (result.IsLockedOut)
        return Unauthorized(new[]
        {
            "تم قفل الحساب مؤقتًا بسبب كثرة المحاولات الخاطئة. حاول مرة أخرى لاحقًا."
        });

    if (!result.Succeeded)
        return Unauthorized(new[] { "كلمة المرور غير صحيحة." });

    var roles = await _users.GetRolesAsync(user);
    var token = GenerateJwt(user, roles);

    return Ok(new AuthResultDto(
        token,
        user.Id,
        user.FullName,
        roles.FirstOrDefault() ?? "User",
        DateTime.UtcNow.AddDays(7)
    ));
}
    // ── Google OAuth ─────────────────────────────────────────
    // Loop through three cases, per the required flow:
    //   1) This Google account is already linked to a user            → log in.
    //   2) No link yet, but the (Google-verified) email already has
    //      an account (e.g. registered normally)                      → link it, log in.
    //   3) Brand new email                                            → stash a short-lived
    //      ticket and ask the frontend to collect a password first.
    private const string GoogleLoginProvider = "Google";

    [HttpPost("google")]
    public async Task<IActionResult> GoogleLogin([FromBody] GoogleLoginDto dto)
    {
        var clientId = _config["Google:ClientId"];
        if (string.IsNullOrWhiteSpace(clientId))
            return StatusCode(503, new[] { "تسجيل الدخول عبر Google غير مفعّل حالياً." });

        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(dto.IdToken, new GoogleJsonWebSignature.ValidationSettings
            {
                Audience = new[] { clientId }
            });
        }
        catch (Exception)
        {
            // Covers an invalid/expired/tampered token as well as transient failures
            // fetching Google's signing keys — either way we can't trust this token.
            return BadRequest(new[] { "فشل التحقق من حساب Google." });
        }

        if (!payload.EmailVerified)
            return BadRequest(new[] { "البريد الإلكتروني المرتبط بحساب Google غير موثّق." });

        // Case 1: this Google account has signed in before — the login is already linked.
        var linkedUser = await _users.FindByLoginAsync(GoogleLoginProvider, payload.Subject);
        if (linkedUser != null)
            return await IssueTokenForAsync(linkedUser);

        // Case 2: no link yet, but the email already belongs to an existing account
        // (e.g. they registered normally first). Link it now and log in directly —
        // no password page, per the "email already exists" requirement.
        var existingByEmail = await _users.FindByEmailAsync(payload.Email);
        if (existingByEmail != null)
        {
            var linkResult = await _users.AddLoginAsync(existingByEmail, new UserLoginInfo(GoogleLoginProvider, payload.Subject, GoogleLoginProvider));
            if (!linkResult.Succeeded)
                return BadRequest(linkResult.Errors.Select(e => e.Description));

            if (!existingByEmail.EmailConfirmed)
            {
                existingByEmail.EmailConfirmed = true;
                await _users.UpdateAsync(existingByEmail);
            }

            return await IssueTokenForAsync(existingByEmail);
        }

        // Case 3: brand new email. Don't create the Identity user yet — stash what we
        // learned from Google behind a short-lived, single-use ticket, and have the
        // frontend collect a password before the account actually gets created.
        var ticket = Guid.NewGuid().ToString("N");
        _cache.Set(
            $"google_pending_{ticket}",
            new PendingGoogleSignup(payload.Email, payload.Name ?? payload.Email, payload.Subject),
            TimeSpan.FromMinutes(15));

        return Ok(new
        {
            requiresPasswordSetup = true,
            ticket,
            email = payload.Email,
            fullName = payload.Name ?? payload.Email,
        });
    }

    // ── Complete Google sign-up (first-time Google users only) ──
    [HttpPost("google/complete-signup")]
    public async Task<IActionResult> CompleteGoogleSignup([FromBody] CompleteGoogleSignupDto dto)
    {
        var cacheKey = $"google_pending_{dto.Ticket}";
        if (!_cache.TryGetValue(cacheKey, out PendingGoogleSignup? pending) || pending == null)
            return BadRequest(new[] { "انتهت صلاحية الجلسة. يرجى تسجيل الدخول عبر Google مرة أخرى." });

        // Guard against a race: someone could've registered this email normally in the
        // few minutes between the Google step and submitting this form.
        if (await _users.FindByEmailAsync(pending.Email) != null)
        {
            _cache.Remove(cacheKey);
            return BadRequest(new[] { "هذا البريد الإلكتروني مستخدم بالفعل." });
        }

        var user = new ApplicationUser
        {
            FullName       = pending.FullName,
            Email          = pending.Email,
            UserName       = pending.Email,
            EmailConfirmed = true, // Google already verified this email
        };

        // Normal ASP.NET Identity password hashing — nothing special about a
        // Google-originated account from here on.
        var createResult = await _users.CreateAsync(user, dto.Password);
        if (!createResult.Succeeded)
            return BadRequest(createResult.Errors.Select(e => e.Description));

        await _users.AddToRoleAsync(user, "User");
        await _users.AddLoginAsync(user, new UserLoginInfo(GoogleLoginProvider, pending.Subject, GoogleLoginProvider));

        _cache.Remove(cacheKey);

        return await IssueTokenForAsync(user);
    }

    // ── Shared: issue our JWT for an already-resolved, active user ──
    private async Task<IActionResult> IssueTokenForAsync(ApplicationUser user)
    {
        if (!user.IsActive)
            return Unauthorized(new[] { "الحساب غير مفعل" });

        var roles = await _users.GetRolesAsync(user);
        var token = GenerateJwt(user, roles);

        return Ok(new AuthResultDto(
            token,
            user.Id,
            user.FullName,
            roles.FirstOrDefault() ?? "User",
            DateTime.UtcNow.AddDays(7)
        ));
    }

    // Internal cache payload for a not-yet-created Google account awaiting a password.
    private sealed record PendingGoogleSignup(string Email, string FullName, string Subject);

    // ── JWT Generator ────────────────────────────────────────
    private string GenerateJwt(ApplicationUser user, IList<string> roles)
    {
        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Email, user.Email!),
            new(ClaimTypes.Name, user.FullName),
        };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var token = new JwtSecurityToken(
            issuer:             _config["Jwt:Issuer"],
            audience:           _config["Jwt:Audience"],
            claims:             claims,
            expires:            DateTime.UtcNow.AddDays(7),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}