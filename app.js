/* =====================================================
 * 吃什么 · 逻辑层 v3
 * 少食多餐作为底层逻辑（无提醒功能）/ 时段感知转盘 / 双模式对话 /
 * 自己填进食记录 + 每周自动周报（含交互统计）/ 买菜清单 / 设置
 * 依赖 data.js
 * ===================================================== */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  const $ = (id) => document.getElementById(id);
  const mod = (a, n) => ((a % n) + n) % n;

  let toastTimer = null;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  /* ---------- 本地存储 ---------- */
  const LOG_KEY = 'cs:log';
  const STATS_KEY = 'cs:stats';
  const FRIDGE_CUSTOM_KEY = 'cs:fridgeCustom';
  const WEIGHTS_KEY = 'cs:weights';
  const ANALYSES_KEY = 'cs:analyses';

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (e) { return fallback; }
  }

  /* ---------- 状态 ---------- */
  const state = {
    spinning: false,
    rotation: 0,
    resultSectorIdx: -1,
    lastFood: null,
    chips: { appetite: '一般', amount: '少', cook: '都行', fridge: [], meal: '' },
    history: [],
    pendingContext: '',
    log: loadJSON(LOG_KEY, []),
    customFridge: loadJSON(FRIDGE_CUSTOM_KEY, []),
    weights: loadJSON(WEIGHTS_KEY, []),
    analyses: Object.assign({}, loadJSON(ANALYSES_KEY, {})),
    weekView: 0,
    stats: Object.assign({ week: '', wheel: 0, chats: 0, recommends: [] }, loadJSON(STATS_KEY, {}))
  };

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function nowHM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function saveStats() {
    localStorage.setItem(STATS_KEY, JSON.stringify(state.stats));
  }

  /* ---------- 转盘（时段感知，只显示食物分类扇区） ---------- */
  const SIZE = 640;
  const VISIBLE = SECTORS.filter(s => !s.hide);
  const N = VISIBLE.length;
  const SEG = (Math.PI * 2) / N;
  const canvas = $('wheelCanvas');
  const ctx = canvas.getContext('2d');

  function setupCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWheel() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const r = SIZE / 2 - 8;
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(state.rotation);
    VISIBLE.forEach((s, i) => {
      const a0 = i * SEG - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a0, a0 + SEG);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.stroke();
      // 文字沿半径排布，宽度自适应不溢出
      ctx.save();
      ctx.rotate(a0 + SEG / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3A2E2A';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText(s.emoji, r * 0.44, 0);
      let fs = 24;
      ctx.font = `bold ${fs}px sans-serif`;
      const maxW = r * 0.42;
      const w = ctx.measureText(s.label).width;
      if (w > maxW) {
        fs = Math.floor(fs * maxW / w);
        ctx.font = `bold ${fs}px sans-serif`;
      }
      ctx.fillText(s.label, r * 0.78, 0);
      ctx.restore();
    });
    ctx.restore();
    // 中心圆
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, 66, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#F3E5D8';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function sectorIndexAtTop() {
    return Math.floor(mod(-state.rotation, Math.PI * 2) / SEG);
  }

  function updateSlotBadge() {
    const slot = timeSlotOf(new Date().getHours());
    const el = $('slotBadge');
    el.textContent = `🕐 现在：${slot.name}`;
    el.classList.toggle('late', slot.key === 'late');
  }

  /* ---------- 侧边栏导航（页面切换） ---------- */
  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebarOverlay').classList.add('hidden');
  }
  function switchPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const page = $('page-' + name);
    if (page) page.classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
    closeSidebar();
    window.scrollTo({ top: 0 });
    if (name === "log") { renderWeekLog(); renderWeightStatus(); }
    if (name === 'recipe') renderRecipePage();
  }

  function spin() {
    if (state.spinning) return;
    state.spinning = true;
    $('btnSpin').classList.add('disabled');
    $('resultCard').classList.add('hidden');

    /* 时段感知：65% 概率落在当前时段合适的可见扇区 */
    const slot = timeSlotOf(new Date().getHours());
    const compat = compatibleSectors(slot.key).filter(s => !s.hide);
    let targetIdx;
    if (compat.length && Math.random() < 0.65) {
      targetIdx = VISIBLE.indexOf(compat[Math.floor(Math.random() * compat.length)]);
    } else {
      targetIdx = Math.floor(Math.random() * N);
    }

    /* 总圈数必须取整：小数圈会在取模时把落点带偏 */
    const turns = Math.ceil(4 + Math.random() * 2);
    const wCur = mod(-state.rotation, Math.PI * 2);
    const wFinal = targetIdx * SEG + Math.random() * SEG;
    const from = state.rotation;
    const to = from + turns * Math.PI * 2 + wCur - wFinal;
    const start = performance.now();
    const DUR = 4200;

    function frame(now) {
      const t = Math.min((now - start) / DUR, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      state.rotation = from + (to - from) * ease;
      drawWheel();
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        state.rotation = to;
        drawWheel();
        state.spinning = false;
        $('btnSpin').classList.remove('disabled');
        state.resultSectorIdx = sectorIndexAtTop();
        if (navigator.vibrate) navigator.vibrate(30);
        state.stats.wheel++;
        saveStats();
        showResult(state.resultSectorIdx);
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 结果卡片 ---------- */
  function slotTipFor(food, slot) {
    if (slot.key === 'late') {
      return food.soft
        ? '🌙 深夜了，这份好消化，适合垫肚子'
        : '🌙 深夜了，这份偏正餐，建议只吃一半或选小份';
    }
    if (slot.light) {
      return food.soft
        ? `🕐 ${slot.name}时段，正好是轻食，饿了就吃`
        : `🕐 ${slot.name}时段，建议吃小份，别一次吃撑`;
    }
    if (slot.key === 'morning' && !/粥|蛋|奶|麦|云吞|豆腐|豆浆/.test(food.n)) {
      return '☀️ 早餐时段，记得配点蛋白质（蛋 / 奶 / 豆浆）';
    }
    return '';
  }

  function portionTipFor(food) {
    if (food.t === '加餐') return '🍽️ 加餐：一小份就够，下一顿正餐照常小份吃';
    if (food.big) return '🍽️ 少食多餐：这份偏大，拆成两顿吃——先吃一半，剩下 1~2 小时后当加餐';
    return '🍽️ 少食多餐：小份吃，1~2 小时后垫一口加餐（酸奶 / 鸡蛋 / 水果）';
  }

  function showResult(idx) {
    const sector = VISIBLE[idx];
    /* 少食多餐是底层逻辑：扇区内优先抽小份，不落大分量 */
    const candidates = sector.pool.filter(f => !f.big);
    const food = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : sector.pool[Math.floor(Math.random() * sector.pool.length)];
    state.lastFood = food;
    state.resultSectorIdx = idx;
    const typeLabel = { '外卖': '点外卖', '做': '自己做', '加餐': '加餐', '随便': '随意' }[food.t] || food.t;

    $('resEmoji').textContent = sector.emoji;
    $('resName').textContent = food.n;
    $('resMeta').textContent = `${sector.label} · ${typeLabel}${food.shop ? ' · ' + food.shop : ''}`;
    $('resHow').textContent = food.how ? `👩‍🍳 做法：${food.how}` : '';
    $('resHow').classList.toggle('hidden', !food.how);
    $('resKcal').textContent = `🔥 ${food.kcal}`;
    $('resTips').innerHTML = '<ul>' + food.tips.map(t => `<li>✅ ${t}</li>`).join('') + '</ul>';
    $('resWhy').textContent = food.why ? `💡 为什么适合你：${food.why}` : `💡 ${PROFILE.appetite}，所以推荐清淡小份为主。`;

    /* 时段提示 + 少食多餐提示（每次推荐都有） */
    const slotTip = slotTipFor(food, timeSlotOf(new Date().getHours()));
    $('resSlotTip').textContent = slotTip;
    $('resSlotTip').classList.toggle('hidden', !slotTip);
    $('resPortion').textContent = portionTipFor(food);

    /* 比价贴士（外卖类） */
    $('priceCompare').classList.toggle('hidden', food.t !== '外卖');
    /* 食谱（自己做类） */
    $('recipeBox').classList.toggle('hidden', food.t !== '做');
    $('recipeBox').open = false;
    if (food.t === '做') renderRecipe(food);

    /* 记录这次推荐（供周报「推荐命中率」统计） */
    state.stats.recommends.push({ name: food.n, ts: Date.now() });
    if (state.stats.recommends.length > 60) state.stats.recommends = state.stats.recommends.slice(-60);
    saveStats();

    $('resultCard').classList.remove('hidden');
    $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- 食谱渲染 ---------- */
  function renderRecipe(food) {
    const box = $('recipeContent');
    const rec = RECIPES[food.n];
    const ing = INGREDIENTS[food.n];
    if (rec || food.how) {
      let html = '';
      if (rec) html += `<div class="recipe-meta">⏱️ ${rec.time} · 1 人份</div>`;
      if (ing && ing.length) {
        html += '<div class="recipe-title">🥬 食材</div><ul class="recipe-list">' + ing.map(i => `<li>${i}</li>`).join('') + '</ul>';
      }
      if (rec && rec.steps && rec.steps.length) {
        html += '<div class="recipe-title">👨‍🍳 步骤</div><ol class="recipe-steps">' + rec.steps.map(s => `<li>${s}</li>`).join('') + '</ol>';
      } else if (food.how) {
        html += `<div class="recipe-hint">👩‍🍳 ${food.how}</div>`;
      }
      box.innerHTML = html;
    } else {
      box.innerHTML = '<div class="recipe-hint">暂无详细食谱，按卡片上的做法做就行</div>';
    }
  }

  /* ---------- 食谱页（侧边栏「食谱」） ---------- */
  function renderRecipePage() {
    const box = $('recipePage');
    let html = '';
    SECTORS.filter(s => !s.hide).forEach(s => {
      const items = s.pool.filter(f => f.t === '做' && RECIPES[f.n]);
      if (!items.length) return;
      html += `<div class="recipe-cat">${s.emoji} ${s.label}</div>`;
      items.forEach(f => {
        const rec = RECIPES[f.n];
        const ing = INGREDIENTS[f.n] || [];
        html += `<details class="recipe-card">
          <summary>${f.n} <span class="recipe-time">${rec.time}</span></summary>
          <div class="recipe-body">
            ${ing.length ? '<div class="recipe-title">🥬 食材</div><ul class="recipe-list">' + ing.map(i => `<li>${i}</li>`).join('') + '</ul>' : ''}
            <div class="recipe-title">👨‍🍳 步骤</div><ol class="recipe-steps">${rec.steps.map(x => `<li>${x}</li>`).join('')}</ol>
          </div>
        </details>`;
      });
    });
    box.innerHTML = html || '<div class="today-empty">食谱库还没内容</div>';
  }

  /* ---------- 进食记录（自己填，按周展示） ---------- */
  function saveLog() {
    localStorage.setItem(LOG_KEY, JSON.stringify(state.log));
  }
  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function logFood(food, eaten) {
    state.log.push({
      date: todayKey(), time: nowHM(), name: food.n, kcalStr: food.kcal,
      eaten, meal: state.chips.meal || '',
      sector: state.resultSectorIdx >= 0 ? VISIBLE[state.resultSectorIdx].id : ''
    });
    if (state.log.length > 600) state.log = state.log.slice(-600);
    saveLog();
    renderWeekLog();
  }
  /* 本周记录视图：周一到周日为一维度，分天展示，只显示当周；过往数据保留在 localStorage */
  function renderWeekLog() {
    const box = $('todayLog');
    const range = weekRange(0);
    const week = state.log.filter(l => l.date >= range.startKey && l.date <= range.endKey);
    const rangeEl = $('weekRangeLabel');
    if (rangeEl) {
      rangeEl.textContent = `📅 本周 ${range.startKey.slice(5).replace('-', '/')} ~ ${range.endKey.slice(5).replace('-', '/')} · 过了周日零点自动翻新`;
    }
    if (!week.length) {
      box.innerHTML = '<div class="today-empty">本周还没有记录 · 转盘结果点「就吃这个」自动记，或直接在上面填</div>';
      return;
    }
    const rowHtml = (l) => {
      const globalIdx = state.log.indexOf(l);
      const mealTag = l.meal && l.meal !== '放纵' ? `<span class="meal-tag">${l.meal}</span> ` : '';
      const isJunk = l.meal === '放纵';
      return `<div class="log-item ${l.eaten ? 'eaten' : ''} ${isJunk ? 'junk' : ''}">
        <span class="dot">${isJunk ? '🍩' : (l.eaten ? '🍽️' : '⏭️')}</span>
        <span class="name">${l.name}</span>
        <span class="kcal">${isJunk ? '<span class="meal-tag junk-tag">放纵</span>' : mealTag}${l.time}${l.kcalStr ? ' · ' + l.kcalStr : ''}</span>
        <button class="del" data-i="${globalIdx}" title="删除">✕</button>
      </div>`;
    };
    /* 按天分组，日期倒序（今天在最上面） */
    const byDate = {};
    week.forEach(l => { (byDate[l.date] = byDate[l.date] || []).push(l); });
    const dates = Object.keys(byDate).sort().reverse();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const today = todayKey();
    const yest = yesterdayKey();
    let html = '';
    dates.forEach(date => {
      const rows = byDate[date];
      const meals = rows.filter(l => l.meal !== '放纵');
      const junk = rows.filter(l => l.meal === '放纵');
      const d = new Date(date + 'T00:00:00');
      const label = date === today ? '今天' : (date === yest ? '昨天' : `${d.getMonth() + 1}/${d.getDate()} ${weekdays[d.getDay()]}`);
      html += `<div class="day-head">${label}</div>`;
      if (meals.length) html += '<div class="log-subhead">🍽️ 正餐</div>' + meals.map(rowHtml).join('');
      if (junk.length) html += '<div class="log-subhead">🍩 不健康食品</div>' + junk.map(rowHtml).join('');
    });
    box.innerHTML = html;
    box.querySelectorAll('.del').forEach(b => {
      b.addEventListener('click', () => {
        state.log.splice(Number(b.dataset.i), 1);
        saveLog();
        renderWeekLog();
      });
    });
  }

  /* ---------- 体重记录 ---------- */
  function saveWeights() {
    localStorage.setItem(WEIGHTS_KEY, JSON.stringify(state.weights));
  }
  function renderWeightStatus() {
    const el = $('weightStatus');
    const ws = state.weights.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = ws[ws.length - 1];
    if (!last) { el.textContent = '记录体重后，周报会算离目标还有多远'; return; }
    const diff = Number(last.kg) - PROFILE.goal * 2;
    el.textContent = diff <= 0
      ? `最近 ${last.kg} 斤 🎉 已到目标！`
      : `最近 ${last.kg} 斤 · 离 ${PROFILE.goal * 2} 斤还差 ${diff.toFixed(1)} 斤`;
  }
  function addWeight() {
    const input = $('weightInput');
    const kg = parseFloat(input.value);
    if (!kg || kg < 30 || kg > 300) { toast('体重格式不对，比如 118'); return; }
    input.value = '';
    state.weights.push({ date: todayKey(), kg });
    if (state.weights.length > 500) state.weights = state.weights.slice(-500);
    saveWeights();
    renderWeightStatus();
    toast('体重已记录 ⚖️');
  }

  /* ---------- 数据备份：导出 / 导入（跨设备、跨网址迁移用） ---------- */
  function exportData() {
    const data = {
      app: 'chishenme',
      version: 1,
      exportedAt: new Date().toISOString(),
      log: state.log,
      weights: state.weights,
      stats: state.stats,
      analyses: state.analyses,
      customFridge: state.customFridge
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `吃什么备份-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast('已导出备份 📤');
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.log) || !Array.isArray(data.weights)) {
          throw new Error('格式不对');
        }
        state.log = data.log;
        state.weights = data.weights;
        state.stats = Object.assign({ week: '', wheel: 0, chats: 0, recommends: [] }, data.stats || {});
        state.analyses = Object.assign({}, data.analyses || {});
        state.customFridge = Array.isArray(data.customFridge) ? data.customFridge : [];
        saveLog();
        saveWeights();
        saveStats();
        saveAnalyses();
        localStorage.setItem(FRIDGE_CUSTOM_KEY, JSON.stringify(state.customFridge));
        renderWeekLog();
        renderWeightStatus();
        toast(`已导入 ${state.log.length} 条记录 📥`);
      } catch (e) {
        toast('导入失败：文件格式不对');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- 周报（每周自动生成 + 手动查看，可前后翻任意周） ---------- */
  /* 某周标题：含日期范围 */
  function weekTitle(weekOffset) {
    const { startKey, endKey } = weekRange(weekOffset);
    const nm = weekOffset === 0 ? '本周' : weekOffset === 1 ? '上周' : `${weekOffset} 周前`;
    return `📊 ${nm}小结 · ${startKey.slice(5).replace('-', '/')} ~ ${endKey.slice(5).replace('-', '/')}`;
  }
  /* 日期所在周的周一（YYYY-MM-DD） */
  function mondayOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay() || 7; // 周日=7
    d.setDate(d.getDate() - dow + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  /* 某日期相对本周的周偏移（过去至少 1 周） */
  function weekOffsetOfDate(dateStr) {
    const a = new Date(mondayOf(dateStr) + 'T00:00:00').getTime();
    const b = new Date(weekRange(0).startKey + 'T00:00:00').getTime();
    return Math.max(1, Math.round((b - a) / 604800000));
  }
  /* 历史入口：跳到最近一个有记录的过去周 */
  function openHistory() {
    const range = weekRange(0);
    const past = state.log.filter(l => l.date < range.startKey);
    if (!past.length) { toast('还没有历史记录，先记几笔，下周自动出周报'); return; }
    const maxDate = past.reduce((m, l) => l.date > m ? l.date : m, '');
    openWeekly(weekOffsetOfDate(maxDate));
  }
  /* 保存 AI 分析（按周 key），最多留 300 条 */
  function saveAnalyses() {
    const keys = Object.keys(state.analyses);
    if (keys.length > 300) {
      keys.sort().slice(0, keys.length - 300).forEach(k => delete state.analyses[k]);
    }
    localStorage.setItem(ANALYSES_KEY, JSON.stringify(state.analyses));
  }

  function openWeekly(weekOffset) {
    state.weekView = weekOffset;
    const interaction = weekOffset === 0
      ? currentWeekInteraction()
      : { wheel: state.stats.wheel, chats: state.stats.chats, recommends: state.stats.recommends };
    const s = computeWeeklySummary(state.log, weekOffset, interaction, state.weights);
    const { monday, end, key, startKey, endKey } = weekRange(weekOffset);
    const maxC = Math.max(1, ...Object.values(s.byDay));
    const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
    let bars = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const k = key(d);
      const c = s.byDay[k] || 0;
      const future = d > end;
      const pct = future ? 0 : Math.round(c / maxC * 100);
      bars += `<div class="day-bar"><span>周${dayNames[i]}</span>
        <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span>${c}</span></div>`;
    }
    const topHtml = s.topSectors.length
      ? '<ul>' + s.topSectors.map(t => `<li>${t}</li>`).join('') + '</ul>'
      : '<ul><li>本周暂无类别数据</li></ul>';

    /* 热量 + 目标进度 */
    const kcalHtml = `
      <div class="weekly-sec"><h4>💰 本周热量估算</h4><ul>
        <li>正餐：约 ${s.mealKcal} kcal（${s.eaten - s.junkCount} 餐）</li>
        <li>不健康食品：约 ${s.junkKcal} kcal（${s.junkCount} 次）</li>
        <li><b>合计：约 ${s.totalKcal} kcal</b></li>
      </ul></div>`;
    const GOAL_JIN = PROFILE.goal * 2;   // 目标体重（斤），读自 PROFILE
    let goalHtml;
    if (s.latestWeight) {
      const diff = s.latestWeight - GOAL_JIN;
      goalHtml = `
      <div class="weekly-sec"><h4>🎯 目标进度（${GOAL_JIN} 斤）</h4><ul>
        <li>最新体重：${s.latestWeight} 斤${s.weightDelta ? `（较上次 ${s.weightDelta > 0 ? '↑' : '↓'} ${Math.abs(s.weightDelta)} 斤）` : ''}</li>
        ${diff > 0
          ? `<li>离 ${GOAL_JIN} 斤还差 <b>${diff.toFixed(1)} 斤</b>（约 ${Math.round(diff * 3850)} kcal 缺口；每周减 1 斤以内最稳，别着急）</li>`
          : `<li>🎉 已经到 ${GOAL_JIN} 斤或以下了！</li>`}
      </ul></div>`;
    } else {
      goalHtml = `<div class="weekly-sec"><h4>🎯 目标进度（${GOAL_JIN} 斤）</h4><ul><li>还没记录过体重：去「今天吃了什么」页面的 ⚖️ 体重 行填一下，这里就算离 ${GOAL_JIN} 斤多远</li></ul></div>`;
    }

    /* 该周记录明细（只读，按日期分组） */
    const weekLogs = state.log
      .filter(l => l.date >= startKey && l.date <= endKey)
      .slice()
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    let detailHtml = '';
    if (weekLogs.length) {
      const byDate = {};
      weekLogs.forEach(l => { (byDate[l.date] = byDate[l.date] || []).push(l); });
      Object.keys(byDate).sort().forEach(date => {
        const d = new Date(date + 'T00:00:00');
        detailHtml += `<div class="week-detail-day">${d.getMonth() + 1}/${d.getDate()} 周${'日一二三四五六'[d.getDay()]}</div>`;
        byDate[date].forEach(l => {
          const isJunk = l.meal === '放纵';
          detailHtml += `<div class="week-detail-row">
            <span>${isJunk ? '🍩' : (l.eaten ? '🍽️' : '⏭️')}</span>
            <span class="name">${l.name}</span>
            <span class="kcal">${l.meal && l.meal !== '放纵' ? `<span class="meal-tag">${l.meal}</span>` : ''}${l.time}${l.kcalStr ? ' · ' + l.kcalStr : ''}</span>
          </div>`;
        });
      });
    } else {
      detailHtml = '<div class="today-empty">该周没有记录</div>';
    }

    /* 已保存的 AI 分析（有则直接回显，按钮变「重新分析」） */
    const saved = state.analyses[startKey];
    const aiBox = $('aiAnalysis');
    aiBox.innerHTML = saved
      ? `<div class="ai-analysis">${saved}</div>`
      : '<div class="recipe-hint">点下面的按钮，AI 会分析本周摄入（热量结构、放纵频率、减脂建议）</div>';
    $('btnAiAnalyze').textContent = saved ? '🔄 重新分析摄入' : '🤖 智能分析摄入';

    $('weeklyTitle').textContent = weekTitle(weekOffset);
    $('btnWeekNext').disabled = weekOffset <= 0;
    $('weeklyBody').innerHTML = `
      <div class="weekly-nums">
        <div class="num"><b>${s.total}</b><span>记录餐次</span></div>
        <div class="num"><b>${s.eaten}</b><span>吃上了</span></div>
        <div class="num"><b>${s.skipped}</b><span>没吃/跳过</span></div>
        <div class="num"><b>${s.streak}</b><span>最长连续</span></div>
      </div>
      ${kcalHtml}
      ${goalHtml}
      <div class="weekly-sec"><h4>每天记录条数</h4>${bars}</div>
      <div class="weekly-sec"><h4>常点的类别 Top3</h4>${topHtml}</div>
      <div class="weekly-sec"><h4>💡 小结</h4><ul>${s.insights.map(t => `<li>${t}</li>`).join('')}</ul></div>
      <details class="weekly-detail" ${weekLogs.length ? '' : 'open'}><summary>📋 记录明细（${weekLogs.length} 条）</summary>${detailHtml}</details>`;
    $('weeklyModal').classList.remove('hidden');
    /* 换周自动周报：首次打开上周且该周还没有分析时，自动跑一次 AI 分析 */
    if (weekOffset === 1 && !saved) setTimeout(() => runAiAnalysis(1), 300);
  }

  /* AI 智能分析本周摄入 */
  async function runAiAnalysis(weekOffset) {
    const box = $('aiAnalysis');
    const btn = $('btnAiAnalyze');
    if (btn) btn.disabled = true;
    box.innerHTML = '<div class="msg ai typing">🤖 AI 正在分析本周摄入…</div>';
    const interaction = weekOffset === 0
      ? currentWeekInteraction()
      : { wheel: state.stats.wheel, chats: state.stats.chats, recommends: state.stats.recommends };
    const s = computeWeeklySummary(state.log, weekOffset, interaction, state.weights);
    const range = weekRange(weekOffset);
    const entries = state.log
      .filter(l => l.date >= range.startKey && l.date <= range.endKey)
      .slice(-15)
      .map(l => `${l.date} ${l.time} ${l.meal || ''} ${l.name}${l.kcalStr ? '（' + l.kcalStr + '）' : ''}`)
      .join('\n');
    const prompt = [
      '以下是本周（周一起）的饮食记录与统计，请用 150 字以内做一份「摄入智能分析」：',
      `- 本周热量估算：正餐约 ${s.mealKcal} kcal（${s.eaten - s.junkCount} 餐），放纵约 ${s.junkKcal} kcal（${s.junkCount} 次），合计约 ${s.totalKcal} kcal`,
      `- 体重：${s.latestWeight ? `${s.latestWeight} 斤（${(s.latestWeight / 2).toFixed(1)} kg）${s.weightDelta ? `（较上次 ${s.weightDelta > 0 ? '↑' : '↓'} ${Math.abs(s.weightDelta)} 斤）` : ''}` : '未记录'}，目标 ${PROFILE.goal * 2} 斤（${PROFILE.goal} kg）。注意：体重统一按「斤」计算，1 kg = 2 斤，不要混用单位`,
      `- 记录明细：\n${entries || '（无）'}`,
      '要求：点评蛋白质够不够、放纵频率是否合适、热量是否符合减脂方向，给出 2~3 条下周可执行的小建议；语气温柔不批评。'
    ].join('\n');
    const answer = await askLLM([{ role: 'user', content: prompt }]);
    if (answer) {
      state.analyses[weekRange(weekOffset).startKey] = answer;
      saveAnalyses();
      box.innerHTML = `<div class="ai-analysis">${answer}</div>`;
      $('btnAiAnalyze').textContent = '🔄 重新分析摄入';
    } else {
      box.innerHTML = '<div class="ai-analysis">AI 暂时连不上，稍后再点一次试试</div>';
    }
    if (btn) btn.disabled = false;
  }

  /* 本周内的交互统计（按时间过滤 recommends） */
  function currentWeekInteraction() {
    const { monday } = weekRange(0);
    const startTs = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime();
    return {
      wheel: state.stats.wheel,
      chats: state.stats.chats,
      recommends: state.stats.recommends.filter(r => r.ts >= startTs)
    };
  }

  /* 跨周自动生成上周周报：仅在“换周后第一次打开”触发 */
  function autoWeeklyCheck() {
    const curWeek = weekRange(0).startKey;
    if (!state.stats.week) {
      state.stats.week = curWeek;
      saveStats();
      return;
    }
    if (state.stats.week !== curWeek) {
      if (state.stats.week === weekRange(1).startKey) {
        openWeekly(1);
      }
      state.stats = { week: curWeek, wheel: 0, chats: 0, recommends: [] };
      saveStats();
    }
  }

  /* ---------- 对话 ---------- */
  const chatBox = $('chatBox');
  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
  }
  function addTyping() {
    const div = document.createElement('div');
    div.className = 'msg ai typing';
    div.textContent = '正在想…';
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
  }

  function chipsStateText() {
    const slot = timeSlotOf(new Date().getHours()).name;
    const cookText = { '想': '想自己做饭', '不想': '不想做饭', '都行': '做饭点外卖都行' }[state.chips.cook];
    const fridge = state.chips.fridge && state.chips.fridge.length
      ? '冰箱有：' + state.chips.fridge.join('、')
      : '冰箱情况：没填';
    return `现在${slot} · 胃口${state.chips.appetite} · 饭量${state.chips.amount} · ${cookText} · ${fridge}`;
  }

  async function sendChat() {
    const input = $('chatInput');
    const text = input.value.trim();
    input.value = '';

    let userMsg = chipsStateText();
    if (state.pendingContext) {
      userMsg = state.pendingContext + '\n' + userMsg;
      state.pendingContext = '';
    }
    if (text) userMsg += '\n' + text;
    userMsg += '\n请给我一个具体的推荐。';

    addMsg('user', userMsg);
    state.history.push({ role: 'user', content: userMsg });
    if (state.history.length > 20) state.history = state.history.slice(-20);

    state.stats.chats++;
    saveStats();

    const typing = addTyping();

    let answer = await askLLM(state.history);
    if (answer === null) {
      addMsg('sys', 'AI 暂时连不上，先用内置规则助手推荐。');
      answer = ruleAnswer(userMsg);
    }

    typing.remove();
    addMsg('ai', answer);
    state.history.push({ role: 'assistant', content: answer });
    if (state.history.length > 20) state.history = state.history.slice(-20);
  }

  /* Agent 模式：走同域 /chat 代理（key 在服务端），失败返回 null 走规则兜底 */
  async function askLLM(messages) {
    const body = {
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: buildSystemPrompt() }, ...messages],
      stream: false,
      temperature: 0.7
    };
    const headers = { 'Content-Type': 'application/json' };
    const attempts = ['/chat', 'http://localhost:8899/chat'];
    for (const url of attempts) {
      try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) { console.warn('LLM HTTP', res.status, url); continue; }
        const data = await res.json();
        const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (content) return content.trim();
      } catch (e) {
        console.warn('LLM fetch fail', url, e);
      }
    }
    return null;
  }

  /* 规则模式：无 key / 调用失败时的兜底（少食多餐已内建在规则引擎） */
  function ruleAnswer(userMsg) {
    const allowJunk = /(薯条|炸鸡|麦辣|麦香鸡|麦当劳|肯德基|汉堡|油炸|kfc|m记)/i.test(userMsg);
    const r = recommendByRules({
      appetite: state.chips.appetite,
      amount: state.chips.amount,
      cook: state.chips.cook,
      fridge: state.chips.fridge,
      hour: new Date().getHours(),
      allowJunk
    });
    if (allowJunk) r.extraTips.push('你点名想吃，可以吃！但记得：去皮、少酱、无糖饮料、小份。');
    const lines = [
      r.reason,
      '',
      `【主选】${r.main.n}${r.main.shop ? '（' + r.main.shop + '）' : ''}`,
      `【备选】${r.backup.n}`,
      `【热量】${r.main.kcal}`,
      `【提示】${r.main.tips.concat(r.extraTips).join('；')}`,
      '',
      '（当前为规则助手模式 · 配置 API Key 后可获得更懂你的回答）'
    ];
    return lines.join('\n');
  }

  /* ---------- 事件绑定 ---------- */
  function bindChips() {
    document.querySelectorAll('.chip-group').forEach(group => {
      const key = group.dataset.key;
      const multi = !!group.dataset.multi;
      group.addEventListener('click', (e) => {
        /* 自定义冰箱食材：点 ✕ 删除 */
        const x = e.target.closest('.chip-x');
        if (x) {
          const span = x.closest('.chip-custom');
          const name = span && span.dataset.val;
          if (name) {
            state.customFridge = state.customFridge.filter(n => n !== name);
            state.chips.fridge = state.chips.fridge.filter(n => n !== name);
            localStorage.setItem(FRIDGE_CUSTOM_KEY, JSON.stringify(state.customFridge));
            renderFridgeCustom();
          }
          return;
        }
        const btn = e.target.closest('.chip');
        if (!btn) return;
        const val = btn.dataset.val;
        if (multi) {
          btn.classList.toggle('active');
          if (val === '没有') {
            group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            state.chips.fridge = [];
          } else {
            const anyBtn = group.querySelector('.chip[data-val="没有"]');
            if (anyBtn) anyBtn.classList.remove('active');
            state.chips.fridge = [...group.querySelectorAll('.chip.active')].map(c => c.dataset.val);
          }
        } else {
          group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          state.chips[key] = val;
        }
      });
    });
    /* 自定义冰箱食材渲染在「➕ 自己加」之前 */
    renderFridgeCustom();
    /* 默认选中（饭量默认「少」符合少食多餐；meal 按当前时段） */
    [['#chipsAppetite', '一般'], ['#chipsAmount', '少'], ['#chipsCook', '都行']].forEach(([sel, val]) => {
      const b = document.querySelector(`${sel} .chip[data-val="${val}"]`);
      if (b) b.classList.add('active');
    });
    const slotKey = timeSlotOf(new Date().getHours()).key;
    const mealDefault = { morning: '早餐', noon: '午餐', evening: '晚餐', snack: '加餐', late: '加餐' }[slotKey];
    const mealBtn = document.querySelector(`#chipsMeal .chip[data-val="${mealDefault}"]`);
    if (mealBtn) mealBtn.classList.add('active');
    state.chips.meal = mealDefault;
  }

  /* 自定义冰箱食材：渲染 chips + 添加/删除 */
  function renderFridgeCustom() {
    const group = $('chipsFridge');
    group.querySelectorAll('.chip-custom').forEach(el => el.remove());
    const addBtn = $('btnAddFridge');
    state.customFridge.forEach(name => {
      const span = document.createElement('span');
      span.className = 'chip chip-custom';
      span.dataset.val = name;
      span.innerHTML = `${name}<span class="chip-x">✕</span>`;
      group.insertBefore(span, addBtn);
    });
  }
  function addCustomFridge() {
    const input = $('fridgeInput');
    const name = input.value.trim();
    if (!name) { toast('先输入食物名'); return; }
    const exists = [...document.querySelectorAll('#chipsFridge .chip')]
      .some(c => c.dataset.val.toLowerCase() === name.toLowerCase());
    if (exists) { toast('已经有了'); input.value = ''; return; }
    state.customFridge.push(name);
    localStorage.setItem(FRIDGE_CUSTOM_KEY, JSON.stringify(state.customFridge));
    renderFridgeCustom();
    /* 自动选中新加的 */
    const span = [...document.querySelectorAll('#chipsFridge .chip-custom')].find(c => c.dataset.val === name);
    if (span) span.classList.add('active');
    state.chips.fridge = [...document.querySelectorAll('#chipsFridge .chip.active')].map(c => c.dataset.val);
    input.value = '';
    $('fridgeAddRow').classList.add('hidden');
    toast('已添加 ✓');
  }

  function bindEvents() {
    /* 侧边栏导航 */
    $('btnMenu').addEventListener('click', () => {
      $('sidebar').classList.add('open');
      $('sidebarOverlay').classList.remove('hidden');
    });
    $('sidebarOverlay').addEventListener('click', closeSidebar);
    document.querySelectorAll('.nav-item').forEach(b => {
      b.addEventListener('click', () => switchPage(b.dataset.page));
    });

    $('btnSpin').addEventListener('click', spin);
    $('btnSpinAgain').addEventListener('click', spin);

    $('btnLogged').addEventListener('click', () => {
      if (state.lastFood) {
        logFood(state.lastFood, true);
        toast('记下了 👍 就吃它！少食多餐，饿了 1~2 小时后再加餐');
      }
    });
    $('btnSkipped').addEventListener('click', () => {
      if (state.lastFood) {
        logFood(state.lastFood, false);
        toast('没关系，下一顿再来 👌');
      }
    });
    $('btnAskAI').addEventListener('click', () => {
      const sector = VISIBLE[state.resultSectorIdx];
      if (sector) {
        state.pendingContext = `（刚才转到「${sector.label}」但我对这个结果不满意）`;
        addMsg('sys', `刚才转到「${sector.label}」不满意 → 我重新给你推荐`);
      }
      switchPage('chat');
    });

    $('btnSend').addEventListener('click', sendChat);
    $('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChat();
    });

    /* 自定义冰箱食材 */
    $('btnAddFridge').addEventListener('click', () => {
      const row = $('fridgeAddRow');
      row.classList.toggle('hidden');
      if (!row.classList.contains('hidden')) $('fridgeInput').focus();
    });
    $('btnFridgeAdd').addEventListener('click', addCustomFridge);
    $('fridgeInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCustomFridge();
    });

    $('btnWeekly').addEventListener('click', () => openWeekly(0));
    $('btnHistory').addEventListener('click', openHistory);
    $('btnWeekPrev').addEventListener('click', () => openWeekly(state.weekView + 1));
    $('btnWeekNext').addEventListener('click', () => { if (state.weekView > 0) openWeekly(state.weekView - 1); });
    $('btnAiAnalyze').addEventListener('click', () => runAiAnalysis(state.weekView));
    $('btnCloseWeekly').addEventListener('click', () => $('weeklyModal').classList.add('hidden'));
    $('weeklyModal').addEventListener('click', (e) => {
      if (e.target === $('weeklyModal')) $('weeklyModal').classList.add('hidden');
    });

    $('btnLogAdd').addEventListener('click', addManualLog);
    $('logInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addManualLog();
    });
    $('btnWeightAdd').addEventListener('click', addWeight);
    $('weightInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addWeight();
    });

    /* 数据备份 */
    $('btnExport').addEventListener('click', exportData);
    $('btnImport').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importData(f);
      e.target.value = '';
    });
  }

  function addManualLog() {
    const input = $('logInput');
    const raw = input.value.trim();
    if (!raw) { toast('先填吃了啥'); return; }
    input.value = '';
    const m = raw.match(/^(.+?)[，,、\s]+(\d+)\s*(?:kcal|千卡|卡)?$/i);
    const name = m ? m[1] : raw;
    const kcalStr = m ? `约 ${m[2]}` : '';
    state.log.push({
      date: todayKey(), time: nowHM(), name, kcalStr, eaten: true,
      meal: state.chips.meal || '', sector: ''
    });
    if (state.log.length > 600) state.log = state.log.slice(-600);
    saveLog();
    renderWeekLog();
    toast('已记一笔 📒（下周自动出周报）');
  }

  /* ---------- 启动 ---------- */
  function init() {
    setupCanvas();
    drawWheel();
    bindEvents();
    bindChips();
    updateSlotBadge();
    renderWeekLog();
    renderRecipePage();
    renderWeightStatus();
    switchPage('home');
    autoWeeklyCheck();
    addMsg('sys', '👋 你好！我是你的健康饮食助手。先点上面的状态（胃口/饭量/做饭），再按「发送」就能拿到推荐；不想思考就先去转个转盘～');
    /* 每分钟刷新时段徽章 + 记录视图（过了周日零点自动翻到新的一周） */
    setInterval(() => {
      updateSlotBadge();
      renderWeekLog();
      renderWeightStatus();
    }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
