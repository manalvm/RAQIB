using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using NSwag;
using NSwag.Generation.Processors.Security;
using RAQIB.API.Hubs;
using RAQIB.Core.Interfaces;
using RAQIB.Core.Models;
using RAQIB.Infrastructure.Data;
using RAQIB.Infrastructure.Repositories;
using RAQIB.Infrastructure.Services;
using System.Text;

namespace RAQIB_API
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // ── Database ─────────────────────────────────────────────────
            builder.Services.AddDbContext<AppDbContext>(opts =>
                opts.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"),
                    sql => sql.MigrationsAssembly("RAQIB.Infrastructure")));

            // ── Identity ─────────────────────────────────────────────────
            builder.Services.AddIdentity<ApplicationUser, IdentityRole>(opts =>
            {
                opts.Password.RequireDigit = true;
                opts.Password.RequiredLength = 8;
                opts.Password.RequireNonAlphanumeric = false;
                opts.User.RequireUniqueEmail = true;
                opts.Lockout.MaxFailedAccessAttempts = 5;
                opts.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
                opts.Lockout.AllowedForNewUsers = true;
            })
            .AddEntityFrameworkStores<AppDbContext>()
            .AddDefaultTokenProviders();

            // ── JWT ──────────────────────────────────────────────────────
            var jwtKey = builder.Configuration["Jwt:Key"]!;
            builder.Services.AddAuthentication(opts =>
            {
                opts.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                opts.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(opts =>
            {
                opts.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = builder.Configuration["Jwt:Issuer"],
                    ValidAudience = builder.Configuration["Jwt:Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(jwtKey))
                };

                opts.Events = new JwtBearerEvents
                {
                    OnMessageReceived = ctx =>
                    {
                        var token = ctx.Request.Query["access_token"];

                        if (!string.IsNullOrEmpty(token))
                        {
                            ctx.Token = token;
                        }

                        return Task.CompletedTask;
                    }
                };
            });

                        // ── Services ─────────────────────────────────────────────────

            builder.Services.AddScoped<IReportRepository, ReportRepository>();

            builder.Services.AddScoped<IEmailService, EmailService>();

            builder.Services.AddScoped<IImageStorageService, ImageStorageService>();

            builder.Services.AddScoped<INotificationRepository, NotificationRepository>();

            builder.Services.AddScoped<IReportPdfService, ReportPdfService>();

            builder.Services.AddSingleton<NotificationService>();

            builder.Services.AddHttpClient<IAiAgentService, AiAgentService>(client =>
            {
                var baseUrl = builder.Configuration["AiAgent:BaseUrl"];

                if (!string.IsNullOrEmpty(baseUrl))
                {
                    client.BaseAddress = new Uri(baseUrl);
                }

                // كان 60 ثانية؛ زودناها كهامش أمان إضافي بعد تسريع الـ FastAPI
                // (warm-up + threadpool offload)، مش لأنها المشكلة الأساسية
                client.Timeout = TimeSpan.FromSeconds(90);
            });

            // ── SignalR ──────────────────────────────────────────────────
            builder.Services.AddSignalR();

            // ── CORS ─────────────────────────────────────────────────────
            builder.Services.AddCors(opts =>
                opts.AddPolicy("Frontend", p =>
            // بعد
                     p.WithOrigins("http://localhost:5173", "http://localhost:5174", "https://localhost:5174")
                     .AllowAnyHeader()
                     .AllowAnyMethod()
                     .AllowCredentials()));

            // ── Controllers ──────────────────────────────────────────────
            builder.Services.AddControllers();
            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddMemoryCache();

            // ── NSwag (Swagger UI) ───────────────────────────────────────
            builder.Services.AddOpenApiDocument(config =>
            {
                config.Title = "RAQIB API";
                config.Version = "v1";
                config.Description = "نظام الرصد والإبلاغ الذكي";

                // JWT Bearer
                config.AddSecurity("Bearer", new OpenApiSecurityScheme
                {
                    Type = OpenApiSecuritySchemeType.Http,
                    Scheme = "bearer",
                    BearerFormat = "JWT",
                    Description = "أدخل الـ JWT token"
                });

                config.OperationProcessors.Add(
                    new AspNetCoreOperationSecurityScopeProcessor("Bearer"));
            });
            QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
            var app = builder.Build();

            // ── Seed Roles + Admin ───────────────────────────────────────
            using (var scope = app.Services.CreateScope())
            {
                var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
                var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

                foreach (var role in new[] { "Admin", "User" })
                    if (!await roleManager.RoleExistsAsync(role))
                        await roleManager.CreateAsync(new IdentityRole(role));

                var adminEmail = app.Configuration["AdminEmail"]!;
                if (await userManager.FindByEmailAsync(adminEmail) == null)
                {
                    var admin = new ApplicationUser
                    {
                        FullName = "System Admin",
                        Email = adminEmail,
                        UserName = adminEmail
                    };
                    await userManager.CreateAsync(admin, app.Configuration["AdminPassword"]!);
                    await userManager.AddToRoleAsync(admin, "Admin");
                }
            }

            // ── Middleware ───────────────────────────────────────────────
            if (app.Environment.IsDevelopment())
            {
                // NSwag Swagger UI
                app.UseOpenApi();
                app.UseSwaggerUi(c =>
                {
                    c.DocumentTitle = "RAQIB API";
                    c.Path = "/swagger";
                });
            }

            app.UseStaticFiles();
            app.UseCors("Frontend");
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapControllers();
            app.MapHub<NotificationHub>("/hubs/notifications");

            app.Run();
        }
    }
}