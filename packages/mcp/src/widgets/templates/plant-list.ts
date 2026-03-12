/**
 * HTML widget template for plant-list and overdue-plants views.
 *
 * Renders a responsive card grid showing each plant with health badge,
 * room info, and ownership status. Action buttons use sendFollowUpMessage
 * to ask the model to call tools (callTool crashes ChatGPT currently).
 */
import {
  baseStyles,
  fontLink,
  themeScript,
} from '@lily/mcp/widgets/templates/styles'

export const plantListTemplate = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fontLink}
${themeScript}
<style>
  ${baseStyles}
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }
  .header h2 {
    font-size: 18px;
    font-weight: 700;
  }
  .count {
    background: var(--primary-tint);
    color: var(--primary);
    font-size: 12px;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: 9999px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    transition: box-shadow 0.15s;
  }
  .card:hover { box-shadow: 0 4px 12px var(--shadow); }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .plant-name {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
  }
  .room {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .ownership {
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
  }
  .card-actions {
    margin-top: 10px;
    display: flex;
    gap: 8px;
  }
</style>
</head>
<body>
  <div id="root"></div>
  <script>
    var _rendered = false;

    function render(data) {
      if (_rendered) return;
      _rendered = true;
      var root = document.getElementById('root');
      if (!data || !data.plants || data.plants.length === 0) {
        root.innerHTML = '<div class="empty">No plants to display</div>';
        return;
      }
      var plants = data.plants;
      var html = '<div class="header"><h2>Your Plants</h2><span class="count">' + plants.length + '</span></div>';
      html += '<div class="grid">';
      for (var i = 0; i < plants.length; i++) {
        var p = plants[i];
        html += '<div class="card ' + esc(p.healthColor) + '">';
        html += '<div class="card-top">';
        html += '<span class="plant-name">' + esc(p.name) + '</span>';
        html += '<span class="badge ' + esc(p.healthColor) + '">' + esc(p.healthLabel) + '</span>';
        html += '</div>';
        if (p.roomName) {
          html += '<div class="room">' + esc(p.roomIcon || '') + ' ' + esc(p.roomName) + '</div>';
        }
        if (p.ownership === 'caretaking') {
          html += '<div class="ownership">Caretaking for ' + esc(p.ownerName || 'someone') + '</div>';
        }
        html += '<div class="card-actions">';
        html += '<button class="btn" data-action="details" data-plant-id="' + esc(p.id) + '" data-plant-name="' + esc(p.name) + '">View Details</button>';
        html += '</div>';
        html += '</div>';
      }
      html += '</div>';
      root.innerHTML = html;
      root.addEventListener('click', onAction);
    }

    function onAction(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var plantName = btn.dataset.plantName || 'this plant';
      var prompt = 'Show me the details for ' + plantName;

      // callTool is broken in ChatGPT (ReactRenderingError), use sendFollowUpMessage
      if (window.openai && window.openai.sendFollowUpMessage) {
        window.openai.sendFollowUpMessage({ prompt: prompt });
        return;
      }

      // Fallback: copy prompt to clipboard for the user to paste
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(prompt).then(function() {
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'View Details'; }, 1500);
        });
      }
    }

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    // Listen for async globals (official ChatGPT data delivery)
    window.addEventListener('openai:set_globals', function() {
      if (window.openai && window.openai.toolOutput) {
        render(window.openai.toolOutput);
      }
    });

    // postMessage fallback (non-ChatGPT MCP clients)
    window.addEventListener('message', function(e) {
      if (e.source !== window.parent) return;
      var msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.jsonrpc === '2.0' && msg.method === 'ui/notifications/tool-result' && msg.params) {
        render(msg.params.structuredContent || msg.params);
        return;
      }
      if (msg.plants) render(msg);
    }, { passive: true });

    // Sync check + polling fallback
    if (window.openai && window.openai.toolOutput) {
      render(window.openai.toolOutput);
    }
    if (!_rendered) {
      var _pollCount = 0;
      var _poll = setInterval(function() {
        _pollCount++;
        if (window.openai && window.openai.toolOutput) {
          clearInterval(_poll);
          render(window.openai.toolOutput);
        }
        if (_pollCount > 50) clearInterval(_poll);
      }, 100);
    }
  </script>
</body>
</html>`
