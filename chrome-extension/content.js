// ============================================================
// ClassIQ — Canvas LMS Content Script (Backend-Connected)
// Authenticates with ClassIQ backend, fetches teacher rules/materials,
// and provides AI chat with instructor-configured guardrails.
// ============================================================

(function () {
  'use strict';

  if (document.getElementById('classiq-fab')) return;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var isOpen = false;
  var messages = [];
  var loading = false;
  var token = '';
  var user = null;
  var courses = [];
  var selectedCourseId = null;
  var sessionId = null;
  var courseRules = null;
  var sessions = [];
  var showingHistory = false;
  var courseName = '';
  var pageContent = '';
  var canvasIdMap = {};
  var currentCanvasCourseId = null;
  var courseNotConnected = false;
  var onCoursePage = false;
  var initReady = false;

  // ---------------------------------------------------------------------------
  // Canvas course ID detection from URL
  // ---------------------------------------------------------------------------
  function detectCanvasCourseIdFromUrl() {
    var match = window.location.pathname.match(/\/courses\/(\d+)/);
    if (match) {
      currentCanvasCourseId = Number(match[1]);
      onCoursePage = true;
    } else {
      onCoursePage = false;
    }
  }

  function autoSelectCanvasCourse() {
    if (!currentCanvasCourseId || courses.length === 0) return;

    // Try to match by canvasId in our map
    if (canvasIdMap[currentCanvasCourseId]) {
      var classiqId = canvasIdMap[currentCanvasCourseId];
      var matched = courses.find(function (c) { return c.id === classiqId; });
      if (matched) {
        selectedCourseId = classiqId;
        courseNotConnected = false;
        return;
      }
    }

    // Try to match by canvas_id field on course objects
    var matchedCourse = courses.find(function (c) {
      return c.canvas_id === currentCanvasCourseId;
    });
    if (matchedCourse) {
      selectedCourseId = matchedCourse.id;
      courseNotConnected = false;
      return;
    }

    // If we're on a course page but no match, flag it
    courseNotConnected = true;
  }

  // ---------------------------------------------------------------------------
  // Canvas auto-discovery and sync
  // ---------------------------------------------------------------------------
  function discoverCanvasCourses() {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'CANVAS_DISCOVER_COURSES' }, function (result) {
        if (chrome.runtime.lastError || !result) { resolve([]); return; }
        resolve(result.courses || []);
      });
    });
  }

  function syncCoursesToClassiq(canvasCourses) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({
        type: 'CLASSIQ_SYNC_COURSES',
        token: token,
        courses: canvasCourses,
      }, function (result) {
        if (chrome.runtime.lastError || !result) { resolve([]); return; }
        if (result.courses) {
          result.courses.forEach(function (sc) {
            canvasIdMap[sc.canvasId] = sc.id;
          });
          resolve(result.courses);
        } else {
          resolve([]);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Canvas page scraping (bonus context sent with messages)
  // ---------------------------------------------------------------------------
  function detectCourse() {
    var breadcrumbs = document.querySelectorAll('#breadcrumbs li a, .ic-app-crumbs a');
    for (var i = 0; i < breadcrumbs.length; i++) {
      var text = breadcrumbs[i].textContent.trim();
      if (text && text.length > 3 && !text.match(/^(home|dashboard|courses)$/i)) {
        courseName = text;
        break;
      }
    }
    if (!courseName) {
      var courseHeader = document.querySelector('.course-title, #section-tabs-header, .ellipsible');
      if (courseHeader && courseHeader.textContent.trim()) {
        courseName = courseHeader.textContent.trim();
      }
    }
    if (!courseName) {
      var parts = (document.title || '').split(':');
      courseName = parts.length > 1 ? parts[parts.length - 1].trim() : parts[0].trim();
    }
  }

  function scrapePageContent() {
    var content = [];
    var moduleItems = document.querySelectorAll('.context_module .ig-title, .module-item-title');
    if (moduleItems.length > 0) {
      content.push('=== COURSE MODULES ===');
      moduleItems.forEach(function (el) { content.push('- ' + el.textContent.trim()); });
    }
    var assignmentBody = document.querySelector('.assignment-description, #assignment_show .description');
    if (assignmentBody) { content.push('\n=== ASSIGNMENT ===\n' + assignmentBody.textContent.trim().slice(0, 3000)); }
    var syllabusBody = document.querySelector('#course_syllabus, .syllabus_content, #syllabusContainer');
    if (syllabusBody) { content.push('\n=== SYLLABUS ===\n' + syllabusBody.textContent.trim().slice(0, 5000)); }
    var wikiBody = document.querySelector('#wiki_page_show .show-content, .user_content');
    if (wikiBody) { content.push('\n=== PAGE CONTENT ===\n' + wikiBody.textContent.trim().slice(0, 5000)); }
    if (content.length === 0) {
      var mainContent = document.querySelector('#content, #main, .ic-Layout-contentMain');
      if (mainContent) { content.push(mainContent.textContent.trim().slice(0, 5000)); }
    }
    pageContent = content.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatTime(date) {
    if (!date) return '';
    var d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatContent(text) {
    var html = escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/^- (.+)/gm, '<li>$1</li>');
    return html;
  }

  function showToast(msg, type) {
    var existing = document.querySelector('.classiq-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'classiq-toast classiq-toast-' + (type || 'success');
    toast.textContent = msg;
    var widget = document.getElementById('classiq-widget');
    if (widget) {
      widget.appendChild(toast);
      setTimeout(function () { toast.remove(); }, 3000);
    }
  }

  function getSelectedCourseLabel() {
    if (!selectedCourseId || courses.length === 0) return courseName || 'your course';
    var c = courses.find(function (c) { return c.id === selectedCourseId; });
    return c ? c.code : (courseName || 'your course');
  }

  function getSelectedCourseName() {
    if (!selectedCourseId || courses.length === 0) return courseName || 'this course';
    var c = courses.find(function (c) { return c.id === selectedCourseId; });
    return c ? (c.code + ' - ' + c.name) : (courseName || 'this course');
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  function loadAuth() {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({
        type: 'GET_SETTINGS',
        keys: ['classiq_token', 'classiq_user'],
      }, function (data) {
        if (chrome.runtime.lastError || !data) { resolve(); return; }
        if (data.classiq_token && data.classiq_user) {
          token = data.classiq_token;
          user = data.classiq_user;
        }
        resolve();
      });
    });
  }

  function validateToken() {
    // Try fetching courses to check if token is still valid
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'CLASSIQ_COURSES', token: token }, function (result) {
        if (chrome.runtime.lastError) { resolve(false); return; }
        if (result && result.error) {
          // Token expired or invalid
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  function login(email, password) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({
        type: 'CLASSIQ_LOGIN',
        email: email,
        password: password,
      }, function (result) {
        if (chrome.runtime.lastError) { resolve({ error: 'Extension error' }); return; }
        if (result && !result.error) {
          token = result.token;
          user = result.user;
        }
        resolve(result || { error: 'No response' });
      });
    });
  }

  function logout() {
    token = '';
    user = null;
    courses = [];
    selectedCourseId = null;
    sessionId = null;
    courseRules = null;
    sessions = [];
    messages = [];
    courseNotConnected = false;
    chrome.storage.local.remove(['classiq_token', 'classiq_user']);
    renderMain();
  }

  // ---------------------------------------------------------------------------
  // API calls
  // ---------------------------------------------------------------------------
  function fetchCourses() {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'CLASSIQ_COURSES', token: token }, function (result) {
        if (chrome.runtime.lastError || !result) { resolve(); return; }
        if (result.courses) {
          courses = result.courses;
          // Auto-select first course if none selected
          if (courses.length > 0 && !selectedCourseId) {
            selectedCourseId = courses[0].id;
          }
        } else if (result.error) {
          // Token might be expired
          console.log('[ClassIQ] Courses fetch error:', result.error);
        }
        resolve();
      });
    });
  }

  function fetchRules() {
    if (!selectedCourseId) return Promise.resolve();
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'CLASSIQ_RULES', token: token, courseId: selectedCourseId }, function (result) {
        if (chrome.runtime.lastError || !result) { resolve(); return; }
        if (result.rules) {
          courseRules = result.rules;
        }
        resolve();
      });
    });
  }

  function fetchSessions() {
    if (!selectedCourseId) return Promise.resolve();
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'CLASSIQ_SESSIONS', token: token, courseId: selectedCourseId }, function (result) {
        if (chrome.runtime.lastError || !result) { resolve(); return; }
        sessions = result.sessions || [];
        resolve();
      });
    });
  }

  function loadSessionMessages(sid) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'CLASSIQ_SESSION_MESSAGES', token: token, sessionId: sid }, function (result) {
        if (chrome.runtime.lastError || !result) { resolve(); return; }
        if (result.messages) {
          messages = result.messages.map(function (m) {
            return {
              role: m.role === 'user' ? 'user' : 'ai',
              content: m.content,
              time: new Date(m.created_at),
              sources: m.sources ? (function () { try { return JSON.parse(m.sources); } catch (e) { return null; } })() : null,
            };
          });
          sessionId = sid;
        }
        resolve();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------
  async function sendMessage(text) {
    if (!text || !text.trim() || loading) return;

    if (!selectedCourseId) {
      messages.push({ role: 'ai', content: 'Please select a course first using the dropdown above.', time: new Date() });
      renderMessages();
      return;
    }

    if (!token) {
      messages.push({ role: 'ai', content: 'Please sign in first to use ClassIQ.', time: new Date() });
      renderMessages();
      return;
    }

    messages.push({ role: 'user', content: text, time: new Date() });
    renderMessages();
    loading = true;
    renderMessages();

    try {
      var result = await new Promise(function (resolve) {
        chrome.runtime.sendMessage({
          type: 'CLASSIQ_CHAT',
          token: token,
          courseId: selectedCourseId,
          message: text,
          sessionId: sessionId,
        }, function (response) {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { error: 'No response from backend' });
          }
        });
      });

      if (result.error) {
        messages.push({ role: 'ai', content: 'Error: ' + result.error, time: new Date() });
      } else {
        if (result.sessionId) sessionId = result.sessionId;
        var content = result.blocked
          ? '\u26A0\uFE0F ' + result.response
          : result.response || 'No response.';
        messages.push({
          role: result.blocked ? 'blocked' : 'ai',
          content: content,
          time: new Date(),
          sources: result.sources,
        });
      }
    } catch (err) {
      messages.push({ role: 'ai', content: 'Extension error: ' + (err.message || err), time: new Date() });
    }

    loading = false;
    renderMessages();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function renderMessages() {
    var container = document.getElementById('classiq-msg-container');
    var welcomeEl = document.getElementById('classiq-welcome');
    var sendBtn = document.getElementById('classiq-send-btn');
    var historyPanel = document.getElementById('classiq-history-panel');

    if (!container) return;
    if (sendBtn) sendBtn.disabled = loading;

    // Don't touch if history panel is showing
    if (historyPanel && historyPanel.style.display === 'flex') return;

    if (messages.length === 0) {
      container.style.display = 'none';
      if (welcomeEl) welcomeEl.style.display = 'flex';
      return;
    }

    container.style.display = 'flex';
    if (welcomeEl) welcomeEl.style.display = 'none';

    var html = '';
    messages.forEach(function (msg) {
      if (msg.role === 'user') {
        // Strip the page context appendage from display
        var displayContent = msg.content;
        var ctxIdx = displayContent.indexOf('\n\n[Current Canvas page context:');
        if (ctxIdx > -1) displayContent = displayContent.slice(0, ctxIdx);
        html += '<div class="classiq-msg classiq-msg-user">' + formatContent(displayContent);
        html += '<div class="classiq-msg-time">' + formatTime(msg.time) + '</div></div>';
      } else if (msg.role === 'blocked') {
        html += '<div class="classiq-msg classiq-msg-blocked">' + formatContent(msg.content);
        html += '<div class="classiq-msg-time">' + formatTime(msg.time) + '</div></div>';
      } else {
        html += '<div class="classiq-msg classiq-msg-ai">' + formatContent(msg.content);
        if (msg.sources && msg.sources.length > 0) {
          html += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(93,63,211,0.15);font-size:10px;color:#6B7280">';
          msg.sources.forEach(function (s) {
            var name = typeof s === 'string' ? s : (s.filename || s);
            html += '<div>\uD83D\uDCCE ' + escapeHtml(name) + '</div>';
          });
          html += '</div>';
        }
        html += '<div class="classiq-msg-time">' + formatTime(msg.time) + '</div>';
        html += '</div>';
      }
    });

    if (loading) {
      html += '<div class="classiq-loading"><span></span><span></span><span></span></div>';
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  function renderMain() {
    var widget = document.getElementById('classiq-widget');
    if (!widget) return;

    if (!token || !user) {
      renderLoginView(widget);
      return;
    }

    renderChatView(widget);
  }

  function renderLoginView(widget) {
    widget.innerHTML = [
      '<div class="classiq-header">',
        '<div class="classiq-header-left">',
          '<div class="classiq-header-avatar">&#129302;</div>',
          '<div class="classiq-header-info">',
            '<div class="classiq-header-title">ClassIQ</div>',
            '<div class="classiq-header-status"><span class="classiq-dot" style="background:#EF4444"></span> <span>Sign in to start</span></div>',
          '</div>',
        '</div>',
        '<div class="classiq-header-actions">',
          '<button id="classiq-minimize-btn" title="Minimize">&minus;</button>',
        '</div>',
      '</div>',

      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px">',
        '<div style="font-size:40px;margin-bottom:12px">&#129302;</div>',
        '<div style="font-size:16px;font-weight:600;color:#1F2937;margin-bottom:4px">Welcome to ClassIQ</div>',
        '<div style="font-size:12px;color:#6B7280;margin-bottom:20px;text-align:center">Sign in with your ClassIQ account to access your courses</div>',
        '<input id="classiq-login-email" type="email" placeholder="Email" style="width:100%;padding:10px 12px;border:1px solid #DDD6FE;border-radius:8px;font-size:13px;outline:none;margin-bottom:8px">',
        '<input id="classiq-login-password" type="password" placeholder="Password" style="width:100%;padding:10px 12px;border:1px solid #DDD6FE;border-radius:8px;font-size:13px;outline:none;margin-bottom:4px">',
        '<div id="classiq-login-error" style="font-size:11px;color:#EF4444;margin-bottom:8px;min-height:16px"></div>',
        '<button id="classiq-login-btn" style="width:100%;padding:10px;background:linear-gradient(135deg,#5D3FD3,#7B5FE0);color:white;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">Sign In</button>',
        '<div style="margin-top:16px;display:flex;flex-direction:column;gap:4px;width:100%">',
          '<div style="font-size:10px;color:#9CA3AF;text-align:center;margin-bottom:4px">QUICK DEMO LOGIN</div>',
          '<div style="display:flex;gap:6px">',
            '<button class="classiq-demo-btn" data-email="habiba@bellevuecollege.edu" style="flex:1;padding:6px;border:1px solid #DDD6FE;border-radius:6px;font-size:11px;cursor:pointer;background:white;color:#5D3FD3;font-weight:500">Student</button>',
            '<button class="classiq-demo-btn" data-email="prof.johnson@bellevuecollege.edu" style="flex:1;padding:6px;border:1px solid #DDD6FE;border-radius:6px;font-size:11px;cursor:pointer;background:white;color:#5D3FD3;font-weight:500">Teacher</button>',
          '</div>',
        '</div>',
      '</div>',

      '<div style="padding:8px;text-align:center;font-size:10px;color:#9CA3AF">&#128274; FERPA compliant &middot; Powered by ClassIQ</div>',
    ].join('');

    document.getElementById('classiq-minimize-btn').addEventListener('click', toggleWidget);

    document.getElementById('classiq-login-btn').addEventListener('click', async function () {
      var email = document.getElementById('classiq-login-email').value.trim();
      var password = document.getElementById('classiq-login-password').value;
      var errEl = document.getElementById('classiq-login-error');
      if (!email || !password) { errEl.textContent = 'Email and password required'; return; }
      errEl.textContent = '';
      this.textContent = 'Signing in...';
      this.disabled = true;
      var result = await login(email, password);
      if (result.error) {
        errEl.textContent = result.error;
        this.textContent = 'Sign In';
        this.disabled = false;
      } else {
        this.textContent = 'Discovering courses...';
        try {
          var canvasCourses = await discoverCanvasCourses();
          if (canvasCourses.length > 0) {
            this.textContent = 'Syncing courses...';
            await syncCoursesToClassiq(canvasCourses);
          }
        } catch (e) {
          // Non-fatal
        }
        await fetchCourses();
        autoSelectCanvasCourse();
        await fetchRules();
        renderMain();
      }
    });

    document.querySelectorAll('.classiq-demo-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.getElementById('classiq-login-email').value = this.dataset.email;
        document.getElementById('classiq-login-password').value = 'password123';
        document.getElementById('classiq-login-btn').click();
      });
    });

    document.getElementById('classiq-login-password').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('classiq-login-btn').click();
    });
  }

  function renderChatView(widget) {
    var courseLabel = getSelectedCourseLabel();
    var courseFullName = getSelectedCourseName();
    var studyModeLabel = courseRules ? courseRules.study_mode : '';
    var modeDesc = {
      socratic: 'Socratic Mode',
      direct: 'Direct Mode',
      practice: 'Practice Mode',
    };

    var courseOptions = '';
    if (courses.length === 0) {
      courseOptions = '<option value="">No courses found</option>';
    } else {
      courseOptions = courses.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === selectedCourseId ? ' selected' : '') + '>' + escapeHtml(c.code) + ' - ' + escapeHtml(c.name) + '</option>';
      }).join('');
    }

    var statusText = courses.length === 0
      ? 'No courses synced'
      : escapeHtml(courseLabel) + (studyModeLabel ? ' \u00B7 ' + (modeDesc[studyModeLabel] || '') : '');

    var statusColor = courses.length === 0 ? '#F59E0B' : '#4ADE80';

    widget.innerHTML = [
      '<div class="classiq-header">',
        '<div class="classiq-header-left">',
          '<div class="classiq-header-avatar">&#129302;</div>',
          '<div class="classiq-header-info">',
            '<div class="classiq-header-title">ClassIQ</div>',
            '<div class="classiq-header-status">',
              '<span class="classiq-dot" style="background:' + statusColor + '"></span> ',
              '<span id="classiq-status-text">' + statusText + '</span>',
            '</div>',
          '</div>',
        '</div>',
        '<div class="classiq-header-actions">',
          '<button id="classiq-history-btn" title="Chat History" style="font-size:14px">&#128336;</button>',
          '<button id="classiq-newchat-btn" title="New Chat">&#10010;</button>',
          '<button id="classiq-logout-btn" title="Sign Out" style="font-size:12px">&#9211;</button>',
          '<button id="classiq-minimize-btn" title="Minimize">&minus;</button>',
        '</div>',
      '</div>',

      // Course selector bar
      '<div style="padding:6px 12px;background:#F8F7FF;border-bottom:1px solid #EDE9FE;display:flex;align-items:center;gap:8px">',
        '<select id="classiq-course-select" style="flex:1;padding:5px 8px;border:1px solid #DDD6FE;border-radius:6px;font-size:11px;outline:none;background:white;color:#374151">' + courseOptions + '</select>',
        '<span style="font-size:10px;color:#6B7280">' + escapeHtml(user ? user.name : '') + '</span>',
      '</div>',

      // History panel (hidden)
      '<div id="classiq-history-panel" style="display:none;flex-direction:column;flex:1;overflow:hidden"></div>',

      // Course not connected banner
      (courseNotConnected
        ? '<div style="padding:10px 14px;background:#FEF3C7;border-bottom:1px solid #FDE68A;font-size:11px;color:#92400E;display:flex;align-items:center;gap:6px">'
          + '<span style="font-size:14px">&#9888;&#65039;</span>'
          + '<span>This Canvas course isn\'t connected to ClassIQ yet. You can still select a connected course from the dropdown.</span>'
          + '</div>'
        : ''),

      // No courses banner
      (courses.length === 0
        ? '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center">'
          + '<div style="font-size:36px;margin-bottom:10px">&#128218;</div>'
          + '<div style="font-size:14px;font-weight:600;color:#1F2937;margin-bottom:4px">No courses found</div>'
          + '<div style="font-size:12px;color:#6B7280;margin-bottom:16px">Make sure you\'re logged into Canvas and navigate to a course page, then reload.</div>'
          + '<button id="classiq-retry-btn" style="padding:8px 16px;background:#5D3FD3;color:white;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-weight:500">Retry Discovery</button>'
          + '</div>'
        : ''),

      // Welcome (only if courses exist)
      (courses.length > 0
        ? '<div class="classiq-welcome" id="classiq-welcome" style="display:flex">'
          + '<div class="classiq-welcome-emoji">&#128075;</div>'
          + '<div class="classiq-welcome-title">Hi, ' + escapeHtml(user ? user.name.split(' ')[0] : '') + '!</div>'
          + '<div class="classiq-welcome-sub">I\'m your AI assistant for <strong>' + escapeHtml(courseFullName) + '</strong>.'
          + (courseRules && courseRules.study_mode === 'socratic' ? ' I\'ll guide you with questions to help you learn.'
            : courseRules && courseRules.study_mode === 'practice' ? ' I\'ll quiz you and give feedback.'
            : ' Ask me anything about the course.')
          + '</div>'
          + '<div class="classiq-quick-actions">'
          + '<button class="classiq-quick-btn" data-msg="What topics are covered in this course?"><span class="classiq-quick-icon">&#128218;</span> Course overview</button>'
          + '<button class="classiq-quick-btn" data-msg="Help me review for an upcoming quiz"><span class="classiq-quick-icon">&#127891;</span> Quiz review</button>'
          + '<button class="classiq-quick-btn" data-msg="Summarize the key concepts from the latest material"><span class="classiq-quick-icon">&#128196;</span> Summarize material</button>'
          + '<button class="classiq-quick-btn" data-msg="Explain the most important concept in simple terms"><span class="classiq-quick-icon">&#128161;</span> Explain simply</button>'
          + '</div>'
          + '</div>'
        : ''),

      // Messages
      '<div class="classiq-messages" id="classiq-msg-container" style="display:none"></div>',

      // Input (only show if courses exist)
      (courses.length > 0
        ? '<div class="classiq-input-area">'
          + '<div class="classiq-input-row">'
          + '<textarea id="classiq-input" placeholder="Ask about ' + escapeHtml(courseLabel) + '..." rows="1"></textarea>'
          + '<button class="classiq-send-btn" id="classiq-send-btn">&#9654;</button>'
          + '</div>'
          + '<div class="classiq-ferpa">&#128274; FERPA compliant &middot; Teacher-configured AI &middot; Powered by ClassIQ</div>'
          + '</div>'
        : ''),
    ].join('');

    // --- Attach events ---
    document.getElementById('classiq-minimize-btn').addEventListener('click', toggleWidget);
    document.getElementById('classiq-logout-btn').addEventListener('click', logout);

    var newChatBtn = document.getElementById('classiq-newchat-btn');
    if (newChatBtn) {
      newChatBtn.addEventListener('click', function () {
        messages = [];
        sessionId = null;
        showingHistory = false;
        var hp = document.getElementById('classiq-history-panel');
        if (hp) hp.style.display = 'none';
        renderMessages();
      });
    }

    var historyBtn = document.getElementById('classiq-history-btn');
    if (historyBtn) {
      historyBtn.addEventListener('click', async function () {
        showingHistory = !showingHistory;
        var panel = document.getElementById('classiq-history-panel');
        if (showingHistory) {
          await fetchSessions();
          renderHistoryPanel();
          panel.style.display = 'flex';
          var mc = document.getElementById('classiq-msg-container');
          var we = document.getElementById('classiq-welcome');
          if (mc) mc.style.display = 'none';
          if (we) we.style.display = 'none';
        } else {
          if (panel) panel.style.display = 'none';
          renderMessages();
        }
      });
    }

    var courseSelect = document.getElementById('classiq-course-select');
    if (courseSelect) {
      courseSelect.addEventListener('change', async function () {
        var val = Number(this.value);
        if (!val) return;
        selectedCourseId = val;
        sessionId = null;
        messages = [];
        sessions = [];
        showingHistory = false;
        courseNotConnected = false;
        var hp = document.getElementById('classiq-history-panel');
        if (hp) hp.style.display = 'none';
        await fetchRules();
        renderMain();
      });
    }

    var sendBtn = document.getElementById('classiq-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        var input = document.getElementById('classiq-input');
        if (!input) return;
        var text = input.value;
        input.value = '';
        input.style.height = 'auto';
        sendMessage(text);
      });
    }

    var inputEl = document.getElementById('classiq-input');
    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var text = this.value;
          this.value = '';
          this.style.height = 'auto';
          sendMessage(text);
        }
      });
      inputEl.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 80) + 'px';
      });
    }

    // Quick action buttons
    widget.querySelectorAll('.classiq-quick-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var msg = this.getAttribute('data-msg');
        if (msg) sendMessage(msg);
      });
    });

    // Retry discovery button (when no courses)
    var retryBtn = document.getElementById('classiq-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', async function () {
        this.textContent = 'Discovering...';
        this.disabled = true;
        try {
          var canvasCourses = await discoverCanvasCourses();
          if (canvasCourses.length > 0) {
            await syncCoursesToClassiq(canvasCourses);
          }
        } catch (e) { /* ignore */ }
        await fetchCourses();
        autoSelectCanvasCourse();
        await fetchRules();
        renderMain();
      });
    }

    // Restore messages if any
    if (courses.length > 0) {
      renderMessages();
    }
  }

  function renderHistoryPanel() {
    var panel = document.getElementById('classiq-history-panel');
    if (!panel) return;

    var html = '<div style="padding:12px 14px;border-bottom:1px solid #EDE9FE;display:flex;justify-content:space-between;align-items:center">';
    html += '<span style="font-weight:600;font-size:13px;color:#1F2937">Chat History</span>';
    html += '<button id="classiq-close-history" style="background:none;border:none;font-size:16px;cursor:pointer;color:#9CA3AF;padding:0">\u2715</button>';
    html += '</div>';

    html += '<div style="flex:1;overflow-y:auto;padding:8px">';
    if (sessions.length === 0) {
      html += '<div style="text-align:center;padding:24px;font-size:12px;color:#9CA3AF">No conversations yet.<br>Start chatting to see history here.</div>';
    } else {
      sessions.forEach(function (s) {
        var isActive = s.id === sessionId;
        html += '<button class="classiq-session-btn" data-sid="' + s.id + '" style="width:100%;text-align:left;padding:10px 12px;margin-bottom:4px;border-radius:8px;border:' + (isActive ? '1px solid rgba(93,63,211,0.3)' : '1px solid transparent') + ';background:' + (isActive ? 'rgba(93,63,211,0.1)' : 'transparent') + ';cursor:pointer;transition:background 0.15s">';
        html += '<div style="font-size:12px;font-weight:500;color:' + (isActive ? '#5D3FD3' : '#1F2937') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(s.title) + '</div>';
        html += '<div style="font-size:10px;color:#9CA3AF;margin-top:2px">' + new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' \u00B7 ' + (s.message_count || 0) + ' messages</div>';
        html += '</button>';
      });
    }
    html += '</div>';

    panel.innerHTML = html;

    document.getElementById('classiq-close-history').addEventListener('click', function () {
      showingHistory = false;
      panel.style.display = 'none';
      renderMessages();
    });

    panel.querySelectorAll('.classiq-session-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var sid = Number(this.dataset.sid);
        await loadSessionMessages(sid);
        showingHistory = false;
        panel.style.display = 'none';
        renderMessages();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Build UI
  // ---------------------------------------------------------------------------
  function buildUI() {
    var fab = document.createElement('button');
    fab.id = 'classiq-fab';
    fab.innerHTML = '<span style="line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.2))">&#129302;</span>';
    fab.innerHTML += '<span class="classiq-badge"></span>';
    fab.innerHTML += '<span class="classiq-tooltip">ClassIQ Course Assistant</span>';
    fab.addEventListener('click', toggleWidget);
    document.body.appendChild(fab);

    var widget = document.createElement('div');
    widget.id = 'classiq-widget';
    document.body.appendChild(widget);

    renderMain();
  }

  function toggleWidget() {
    isOpen = !isOpen;
    var widget = document.getElementById('classiq-widget');
    if (isOpen) {
      widget.classList.add('classiq-open');
      var input = document.getElementById('classiq-input');
      if (input) setTimeout(function () { input.focus(); }, 300);
    } else {
      widget.classList.remove('classiq-open');
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  async function init() {
    detectCourse();
    detectCanvasCourseIdFromUrl();
    scrapePageContent();
    buildUI();
    await loadAuth();
    if (token && user) {
      // Validate the stored token is still good
      var valid = await validateToken();
      if (!valid) {
        // Token expired, force re-login
        token = '';
        user = null;
        chrome.storage.local.remove(['classiq_token', 'classiq_user']);
        renderMain();
        return;
      }

      // Auto-discover and sync Canvas courses
      try {
        var canvasCourses = await discoverCanvasCourses();
        if (canvasCourses.length > 0) {
          await syncCoursesToClassiq(canvasCourses);
        }
      } catch (e) {
        // Non-fatal
      }
      await fetchCourses();
      autoSelectCanvasCourse();
      await fetchRules();
      renderMain();
    }
    initReady = true;
  }

  init();
})();
