/**
 * HTML widget template for single plant detail view.
 *
 * Renders plant info with care ratings as progress bars, schedule list,
 * and recent care history. Action buttons for watering/fertilizing.
 */
import {
  baseStyles,
  fontLink,
  themeScript,
} from '@lily/mcp/widgets/templates/styles'

export const plantDetailsTemplate = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fontLink}
${themeScript}
<style>
  ${baseStyles}
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    max-width: 480px;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  .plant-name { font-size: 20px; font-weight: 700; }
  .meta {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .section {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .section-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 10px;
    color: var(--primary);
  }
  .rating-row {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .rating-label { width: 110px; color: var(--text-secondary); }
  .rating-bar {
    flex: 1;
    height: 8px;
    background: var(--surface-tinted);
    border-radius: 4px;
    overflow: hidden;
    margin: 0 8px;
  }
  .rating-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }
  .rating-val { font-weight: 600; width: 30px; text-align: right; }
  .schedule-item, .log-item {
    font-size: 13px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
  }
  .schedule-item:last-child, .log-item:last-child { border-bottom: none; }
  .actions {
    margin-top: 16px;
    display: flex;
    gap: 8px;
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
      if (!data || !data.plant) {
        root.innerHTML = '<div class="empty">No plant data available</div>';
        return;
      }
      var p = data.plant;
      var html = '<div class="card">';

      html += '<div class="card-header">';
      html += '<span class="plant-name">' + esc(p.name) + '</span>';
      html += '<span class="badge ' + esc(p.healthColor) + '">' + esc(p.healthLabel) + '</span>';
      html += '</div>';

      if (p.roomName) html += '<div class="meta">' + esc(p.roomIcon || '') + ' ' + esc(p.roomName) + '</div>';
      if (p.category) html += '<div class="meta">' + esc(p.category) + '</div>';

      html += '<div class="section"><div class="section-title">Care Ratings</div>';
      html += ratingRow('Water needs', p.wateringRating, 'var(--water)');
      html += ratingRow('Light needs', p.lightingRating, 'var(--warning)');
      html += ratingRow('Humidity', p.humidityRating, '#14b8a6');
      html += ratingRow('Pet toxicity', p.petToxicityRating, 'var(--error)');
      html += '</div>';

      if (p.schedules && p.schedules.length > 0) {
        html += '<div class="section"><div class="section-title">Care Schedule</div>';
        for (var i = 0; i < p.schedules.length; i++) {
          var s = p.schedules[i];
          html += '<div class="schedule-item"><strong>' + esc(s.careType) + '</strong>: every ' + s.frequencyDays + ' days';
          if (s.nextCareAt) html += ' (next: ' + esc(s.nextCareAt) + ')';
          html += '</div>';
        }
        html += '</div>';
      }

      if (p.recentCare && p.recentCare.length > 0) {
        html += '<div class="section"><div class="section-title">Recent Care</div>';
        for (var j = 0; j < p.recentCare.length; j++) {
          var l = p.recentCare[j];
          html += '<div class="log-item">' + esc(l.date) + ': ' + esc(l.type);
          if (l.notes) html += ' — ' + esc(l.notes);
          html += '</div>';
        }
        html += '</div>';
      }

      if (p.needsWatering || p.needsFertilizing) {
        html += '<div class="actions">';
        if (p.needsWatering) {
          html += '<button class="btn btn-water" data-action="water" data-plant-name="' + esc(p.name) + '">Water</button>';
        }
        if (p.needsFertilizing) {
          html += '<button class="btn btn-fertilize" data-action="fertilize" data-plant-name="' + esc(p.name) + '">Fertilize</button>';
        }
        html += '</div>';
      }

      html += '</div>';
      root.innerHTML = html;
      root.addEventListener('click', onAction);
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

    function ratingRow(label, value, color) {
      var pct = (value / 5 * 100);
      return '<div class="rating-row">'
        + '<span class="rating-label">' + label + '</span>'
        + '<div class="rating-bar"><div class="rating-fill" style="width:'+pct+'%;background:'+color+'"></div></div>'
        + '<span class="rating-val">' + value + '/5</span>'
        + '</div>';
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
      if (msg.plant) render(msg);
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
