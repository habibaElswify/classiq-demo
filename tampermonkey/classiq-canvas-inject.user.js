// ==UserScript==
// @name         ClassIQ Canvas Integration
// @namespace    classiq-demo
// @version      1.0
// @description  Injects ClassIQ AI Course Assistant into Canvas LMS
// @match        https://*.instructure.com/*
// @match        http://localhost:3000/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let isOpen = false;
  let messages = [];
  let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  let loading = false;
  let authToken = null;

  const API_BASE = 'http://localhost:3000';
  const COURSE_ID = 1;

  // ---------------------------------------------------------------------------
  // Styles (injected via GM_addStyle)
  // ---------------------------------------------------------------------------
  GM_addStyle(`
    /* Floating button */
    #classiq-fab {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #5D3FD3;
      border: none;
      cursor: pointer;
      font-size: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(93, 63, 211, 0.4);
      z-index: 99999;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    #classiq-fab:hover {
      transform: scale(1.1) translateY(-2px);
      box-shadow: 0 6px 24px rgba(93, 63, 211, 0.55);
    }
    #classiq-fab .classiq-tooltip {
      position: absolute;
      bottom: 70px;
      right: 0;
      background: #333;
      color: #fff;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 4px 10px;
      border-radius: 6px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    #classiq-fab:hover .classiq-tooltip {
      opacity: 1;
    }

    /* Chat widget */
    #classiq-widget {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 380px;
      height: 520px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      z-index: 99998;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    #classiq-widget.classiq-open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* Header */
    .classiq-header {
      background: linear-gradient(135deg, #5D3FD3 0%, #7B5FE0 100%);
      color: #fff;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .classiq-header-left {
      display: flex;
      flex-direction: column;
    }
    .classiq-header-title {
      font-size: 16px;
      font-weight: 700;
    }
    .classiq-header-course {
      font-size: 12px;
      opacity: 0.85;
      margin-top: 2px;
    }
    .classiq-header-actions {
      display: flex;
      gap: 8px;
    }
    .classiq-header-actions button {
      background: rgba(255,255,255,0.2);
      border: none;
      color: #fff;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease;
    }
    .classiq-header-actions button:hover {
      background: rgba(255,255,255,0.35);
    }

    /* Messages area */
    .classiq-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .classiq-messages::-webkit-scrollbar {
      width: 5px;
    }
    .classiq-messages::-webkit-scrollbar-thumb {
      background: #ccc;
      border-radius: 3px;
    }

    /* Chat bubbles */
    .classiq-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.45;
      word-wrap: break-word;
    }
    .classiq-msg-user {
      align-self: flex-end;
      background: #5D3FD3;
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .classiq-msg-ai {
      align-self: flex-start;
      background: #f1f1f4;
      color: #222;
      border-bottom-left-radius: 4px;
    }
    .classiq-msg-blocked {
      align-self: flex-start;
      background: #FFF3CD;
      color: #856404;
      border-bottom-left-radius: 4px;
      border: 1px solid #FFEEBA;
    }
    .classiq-msg-blocked::before {
      content: '\\26A0\\FE0F ';
    }
    .classiq-msg-sources {
      font-size: 11px;
      color: #3B82F6;
      margin-top: 6px;
    }

    /* Loading dots */
    .classiq-loading {
      align-self: flex-start;
      display: flex;
      gap: 4px;
      padding: 12px 16px;
    }
    .classiq-loading span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #5D3FD3;
      animation: classiq-bounce 1.2s infinite;
    }
    .classiq-loading span:nth-child(2) { animation-delay: 0.15s; }
    .classiq-loading span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes classiq-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    /* Welcome state */
    .classiq-welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 24px;
      text-align: center;
    }
    .classiq-welcome-emoji {
      font-size: 40px;
      margin-bottom: 12px;
    }
    .classiq-welcome-title {
      font-size: 18px;
      font-weight: 700;
      color: #222;
      margin-bottom: 6px;
    }
    .classiq-welcome-sub {
      font-size: 13px;
      color: #666;
      margin-bottom: 20px;
    }
    .classiq-quick-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }
    .classiq-quick-btn {
      background: #F3EFFE;
      border: 1px solid #E0D4FC;
      color: #5D3FD3;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s ease;
    }
    .classiq-quick-btn:hover {
      background: #E6DDFC;
    }

    /* Input area */
    .classiq-input-area {
      padding: 12px;
      border-top: 1px solid #eee;
      flex-shrink: 0;
    }
    .classiq-input-row {
      display: flex;
      gap: 8px;
    }
    .classiq-input-row input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 10px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .classiq-input-row input:focus {
      border-color: #5D3FD3;
    }
    .classiq-input-row button {
      background: #5D3FD3;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 0 16px;
      font-size: 15px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .classiq-input-row button:hover {
      background: #4C2FC2;
    }
    .classiq-input-row button:disabled {
      background: #B8A9E8;
      cursor: not-allowed;
    }
    .classiq-ferpa {
      text-align: center;
      font-size: 10px;
      color: #999;
      margin-top: 6px;
    }
  `);

  // ---------------------------------------------------------------------------
  // Auto-login
  // ---------------------------------------------------------------------------
  async function autoLogin() {
    try {
      const res = await fetch(API_BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'habiba@bellevuecollege.edu',
          password: 'password123'
        })
      });
      if (res.ok) {
        const data = await res.json();
        authToken = data.token || data.accessToken || null;
        console.log('[ClassIQ] Logged in successfully');
      } else {
        console.warn('[ClassIQ] Login failed:', res.status);
      }
    } catch (err) {
      console.warn('[ClassIQ] Login error:', err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------
  async function sendMessage(text) {
    if (!text.trim() || loading) return;

    // Add user message
    messages.push({ role: 'user', content: text });
    renderMessages();
    loading = true;
    renderMessages();

    try {
      const res = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (authToken || '')
        },
        body: JSON.stringify({
          courseId: COURSE_ID,
          message: text,
          sessionId: sessionId
        })
      });

      const data = await res.json();

      if (data.blocked) {
        messages.push({
          role: 'blocked',
          content: data.message || data.response || 'This question is outside the scope of the course.'
        });
      } else {
        const aiContent = data.response || data.message || data.answer || 'No response received.';
        const sources = data.sources || data.citations || null;
        messages.push({ role: 'ai', content: aiContent, sources: sources });
      }
    } catch (err) {
      messages.push({ role: 'ai', content: 'Sorry, I could not reach the server. Please try again.' });
    }

    loading = false;
    renderMessages();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  function renderMessages() {
    const container = document.getElementById('classiq-msg-container');
    const welcomeEl = document.getElementById('classiq-welcome');
    const sendBtn = document.getElementById('classiq-send-btn');

    if (!container) return;

    if (sendBtn) sendBtn.disabled = loading;

    if (messages.length === 0) {
      container.style.display = 'none';
      if (welcomeEl) welcomeEl.style.display = 'flex';
      return;
    }

    container.style.display = 'flex';
    if (welcomeEl) welcomeEl.style.display = 'none';

    let html = '';
    messages.forEach(function (msg) {
      if (msg.role === 'user') {
        html += '<div class="classiq-msg classiq-msg-user">' + escapeHtml(msg.content) + '</div>';
      } else if (msg.role === 'blocked') {
        html += '<div class="classiq-msg classiq-msg-blocked">' + escapeHtml(msg.content) + '</div>';
      } else {
        html += '<div class="classiq-msg classiq-msg-ai">' + escapeHtml(msg.content);
        if (msg.sources && msg.sources.length > 0) {
          html += '<div class="classiq-msg-sources">Sources: ' + msg.sources.map(function (s) {
            return escapeHtml(typeof s === 'string' ? s : s.name || s.title || JSON.stringify(s));
          }).join(', ') + '</div>';
        }
        html += '</div>';
      }
    });

    if (loading) {
      html += '<div class="classiq-loading"><span></span><span></span><span></span></div>';
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------------
  // Build UI
  // ---------------------------------------------------------------------------
  function buildUI() {
    // Floating action button
    var fab = document.createElement('button');
    fab.id = 'classiq-fab';
    fab.innerHTML = '<span style="line-height:1">&#129302;</span><span class="classiq-tooltip">ClassIQ</span>';
    fab.addEventListener('click', toggleWidget);
    document.body.appendChild(fab);

    // Chat widget
    var widget = document.createElement('div');
    widget.id = 'classiq-widget';
    widget.innerHTML = [
      // Header
      '<div class="classiq-header">',
        '<div class="classiq-header-left">',
          '<div class="classiq-header-title">&#129302; ClassIQ</div>',
          '<div class="classiq-header-course">CSS 370</div>',
        '</div>',
        '<div class="classiq-header-actions">',
          '<button id="classiq-minimize-btn" title="Minimize">&minus;</button>',
          '<button id="classiq-close-btn" title="Close">&times;</button>',
        '</div>',
      '</div>',

      // Welcome state
      '<div class="classiq-welcome" id="classiq-welcome">',
        '<div class="classiq-welcome-emoji">&#128075;</div>',
        '<div class="classiq-welcome-title">Hi! I\'m ClassIQ</div>',
        '<div class="classiq-welcome-sub">Your AI course assistant for CSS 370. Ask me anything about the course material.</div>',
        '<div class="classiq-quick-actions">',
          '<button class="classiq-quick-btn" data-msg="What topics are covered in this course?">&#128218; What topics are covered in this course?</button>',
          '<button class="classiq-quick-btn" data-msg="Summarize the latest lecture">&#128221; Summarize the latest lecture</button>',
          '<button class="classiq-quick-btn" data-msg="Help me prepare for the next exam">&#127891; Help me prepare for the next exam</button>',
        '</div>',
      '</div>',

      // Messages container (hidden by default)
      '<div class="classiq-messages" id="classiq-msg-container" style="display:none"></div>',

      // Input area
      '<div class="classiq-input-area">',
        '<div class="classiq-input-row">',
          '<input type="text" id="classiq-input" placeholder="Ask about CSS 370..." />',
          '<button id="classiq-send-btn">&#9654;</button>',
        '</div>',
        '<div class="classiq-ferpa">&#128274; FERPA compliant</div>',
      '</div>'
    ].join('');

    document.body.appendChild(widget);

    // Event listeners
    document.getElementById('classiq-minimize-btn').addEventListener('click', toggleWidget);
    document.getElementById('classiq-close-btn').addEventListener('click', closeWidget);

    document.getElementById('classiq-send-btn').addEventListener('click', function () {
      var input = document.getElementById('classiq-input');
      var text = input.value;
      input.value = '';
      sendMessage(text);
    });

    document.getElementById('classiq-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var text = this.value;
        this.value = '';
        sendMessage(text);
      }
    });

    // Quick action buttons
    widget.querySelectorAll('.classiq-quick-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sendMessage(this.getAttribute('data-msg'));
      });
    });
  }

  function toggleWidget() {
    isOpen = !isOpen;
    var widget = document.getElementById('classiq-widget');
    if (isOpen) {
      widget.classList.add('classiq-open');
      var input = document.getElementById('classiq-input');
      if (input) input.focus();
    } else {
      widget.classList.remove('classiq-open');
    }
  }

  function closeWidget() {
    isOpen = false;
    document.getElementById('classiq-widget').classList.remove('classiq-open');
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  buildUI();
  autoLogin();

})();
