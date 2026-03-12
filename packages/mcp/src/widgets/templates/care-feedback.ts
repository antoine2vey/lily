/**
 * HTML widget template for care action confirmation.
 *
 * Shown after watering/fertilizing a plant. Displays a success
 * message with the plant name, care type, and next care estimate.
 */
import {
  baseStyles,
  fontLink,
  themeScript,
} from '@lily/mcp/widgets/templates/styles'

export const careFeedbackTemplate = /* html */ `<!DOCTYPE html>
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
    padding: 24px;
    max-width: 400px;
    text-align: center;
  }
  .icon {
    font-size: 40px;
    margin-bottom: 12px;
  }
  .title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 8px;
    color: var(--primary);
  }
  .plant-name {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .care-type {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 12px;
  }
  .next-care {
    font-size: 13px;
    color: var(--text-secondary);
    background: var(--surface-tinted);
    padding: 8px 14px;
    border-radius: 8px;
    display: inline-block;
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
      if (!data || !data.feedback) {
        root.innerHTML = '<div class="empty">No feedback data</div>';
        return;
      }
      var f = data.feedback;
      var icon = f.careType === 'fertilization' ? '&#127793;' : '&#128167;';

      var html = '<div class="card">';
      html += '<div class="icon">' + icon + '</div>';
      html += '<div class="title">' + esc(f.careLabel) + '!</div>';
      html += '<div class="plant-name">' + esc(f.plantName) + '</div>';
      if (f.nextCareEstimate) {
        html += '<div class="next-care">Next ' + esc(f.careType) + ' in ~' + esc(f.nextCareEstimate) + '</div>';
      }
      html += '</div>';
      root.innerHTML = html;
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
      if (msg.feedback) render(msg);
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
