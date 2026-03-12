/**
 * HTML widget template for care tasks view.
 *
 * Renders tasks grouped by overdue/today/upcoming with color-coded
 * section headers. Each task has an action button.
 */
import {
  baseStyles,
  fontLink,
  themeScript,
} from '@lily/mcp/widgets/templates/styles'

export const careTasksTemplate = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fontLink}
${themeScript}
<style>
  ${baseStyles}
  .group { margin-bottom: 20px; }
  .group-header {
    font-size: 14px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 8px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .group-overdue { background: var(--error-bg); color: var(--error); }
  .group-today { background: var(--warning-bg); color: var(--warning); }
  .group-upcoming { background: var(--success-bg); color: var(--primary); }
  .group-count {
    font-size: 12px;
    opacity: 0.7;
  }
  .task {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .task-info { flex: 1; }
  .task-plant {
    font-size: 14px;
    font-weight: 600;
  }
  .task-meta {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .btn-water { background: var(--water-bg); color: var(--water); border-color: transparent; }
  .btn-water:hover { opacity: 0.85; }
  .btn-fertilize { background: var(--warning-bg); color: var(--warning); border-color: transparent; }
  .btn-fertilize:hover { opacity: 0.85; }
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
      if (!data || !data.tasks) {
        root.innerHTML = '<div class="empty">No care tasks available</div>';
        return;
      }
      var tasks = data.tasks;
      var hasAny = (tasks.overdue && tasks.overdue.length > 0)
                || (tasks.today && tasks.today.length > 0)
                || (tasks.upcoming && tasks.upcoming.length > 0);

      if (!hasAny) {
        root.innerHTML = '<div class="empty">All caught up! No pending care tasks.</div>';
        return;
      }

      var html = '';
      if (tasks.overdue && tasks.overdue.length > 0) {
        html += renderGroup('Overdue', 'overdue', tasks.overdue);
      }
      if (tasks.today && tasks.today.length > 0) {
        html += renderGroup('Today', 'today', tasks.today);
      }
      if (tasks.upcoming && tasks.upcoming.length > 0) {
        html += renderGroup('Upcoming', 'upcoming', tasks.upcoming);
      }
      root.innerHTML = html;
      root.addEventListener('click', onAction);
    }

    function renderGroup(label, cls, items) {
      var html = '<div class="group">';
      html += '<div class="group-header group-' + cls + '">' + label + ' <span class="group-count">(' + items.length + ')</span></div>';
      for (var i = 0; i < items.length; i++) {
        var t = items[i];
        html += '<div class="task">';
        html += '<div class="task-info">';
        html += '<div class="task-plant">' + esc(t.plantName) + '</div>';
        html += '<div class="task-meta">' + esc(t.careType) + ' — ' + esc(t.dueDate) + '</div>';
        if (t.roomName) html += '<div class="task-meta">' + esc(t.roomIcon || '') + ' ' + esc(t.roomName) + '</div>';
        html += '</div>';
        if (t.actionable) {
          var isFertilize = t.careType === 'fertilize';
          var btnClass = isFertilize ? 'btn-fertilize' : 'btn-water';
          var btnLabel = isFertilize ? 'Fertilize' : 'Water';
          var action = isFertilize ? 'fertilize' : 'water';
          html += '<button class="btn ' + btnClass + '" data-action="' + action + '" data-plant-name="' + esc(t.plantName) + '">' + btnLabel + '</button>';
        }
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function onAction(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      var plantName = btn.dataset.plantName || 'this plant';
      var prompt = action === 'water'
        ? 'Water ' + plantName
        : 'Fertilize ' + plantName;

      if (window.openai && window.openai.sendFollowUpMessage) {
        window.openai.sendFollowUpMessage({ prompt: prompt });
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(prompt).then(function() {
          var origText = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = origText; }, 1500);
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
      if (msg.tasks) render(msg);
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
