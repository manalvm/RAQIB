using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RAQIB.Core.DTOs;
using RAQIB.Core.Interfaces;

namespace RAQIB.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly INotificationRepository _notifications;

    public NotificationsController(INotificationRepository notifications)
    {
        _notifications = notifications;
    }

    // GET /api/notifications
    [HttpGet]
    public async Task<IActionResult> GetMy()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var items = await _notifications.GetByUserIdAsync(userId);
        return Ok(items.Select(n => new NotificationDto(
            n.Id, n.ReportId, n.Title, n.Message, n.Type, n.IsRead, n.CreatedAt)));
    }

    // GET /api/notifications/unread-count
    [HttpGet("unread-count")]
    public async Task<IActionResult> GetUnreadCount()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var count = await _notifications.GetUnreadCountAsync(userId);
        return Ok(new { count });
    }

    // PATCH /api/notifications/{id}/read
    [HttpPatch("{id:int}/read")]
    public async Task<IActionResult> MarkAsRead(int id)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var ok = await _notifications.MarkAsReadAsync(id, userId);
        if (!ok) return NotFound();
        return Ok();
    }

    // PATCH /api/notifications/read-all
    [HttpPatch("read-all")]
    public async Task<IActionResult> MarkAllAsRead()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await _notifications.MarkAllAsReadAsync(userId);
        return Ok();
    }
}