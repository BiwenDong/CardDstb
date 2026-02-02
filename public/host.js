const startBtn = document.getElementById("startBtn")
const endBtn = document.getElementById("endBtn")
const msg = document.getElementById("msg")
const drawsDiv = document.getElementById("draws")
const sheriffStartBtn = document.getElementById("sheriffStartBtn")
const sheriffFinishBtn = document.getElementById("sheriffFinishBtn")
const sheriffPanel = document.getElementById("sheriffPanel")
const nightStartBtn = document.getElementById("nightStartBtn")
const nightEndBtn = document.getElementById("nightEndBtn")
const nightPanel = document.getElementById("nightPanel")
const voteStartBtn = document.getElementById("voteStartBtn")
const voteFinishBtn = document.getElementById("voteFinishBtn")
const votePanel = document.getElementById("votePanel")




const playersInput = document.getElementById("players")

const roleInputs = {
  "狼人": document.getElementById("role_狼人"),
  "平民": document.getElementById("role_平民"),
  "女巫": document.getElementById("role_女巫"),
  "预言家": document.getElementById("role_预言家"),
  "猎人": document.getElementById("role_猎人"),
  "守卫": document.getElementById("role_守卫"),
  "白痴": document.getElementById("role_白痴"),
}

function getConfigFromForm() {
  const players = Number(playersInput.value)
  const counts = {}
  let sum = 0

  for (const role of Object.keys(roleInputs)) {
    const v = Number(roleInputs[role].value)
    counts[role] = v
    sum += v
  }

  return { players, counts, sum }
}

function setFormFromPreset(preset) {
  playersInput.value = String(preset.players)
  for (const role of Object.keys(roleInputs)) {
    roleInputs[role].value = String(preset.counts[role] ?? 0)
  }
  msg.innerText = `已填充预设：${preset.players} 人（尚未开始）`
}

const PRESETS = {
  6: {
    players: 6,
    counts: { "狼人": 2, "平民": 2, "女巫": 0, "预言家": 1, "猎人": 0, "守卫": 1, "白痴": 0 }
  },
  9: {
    players: 9,
    counts: { "狼人": 3, "平民": 3, "女巫": 1, "预言家": 1, "猎人": 1, "守卫": 0, "白痴": 0 }
  },
  12: {
    players: 12,
    counts: { "狼人": 4, "平民": 4, "女巫": 1, "预言家": 1, "猎人": 1, "守卫": 0, "白痴": 1 }
  },
}

document.getElementById("preset6").onclick = () => setFormFromPreset(PRESETS[6])
document.getElementById("preset9").onclick = () => setFormFromPreset(PRESETS[9])
document.getElementById("preset12").onclick = () => setFormFromPreset(PRESETS[12])

async function syncStatus() {
  const res = await fetch("/status", { cache: "no-store" })
  const { started, remaining } = await res.json()
await syncSheriff()
await syncNight()


  startBtn.disabled = started
  endBtn.disabled = !started
  msg.innerText = started ? `🟢 游戏进行中（剩余 ${remaining} 张）` : "🔴 游戏未开始"

  // 抽牌记录
  const r2 = await fetch("/draws", { cache: "no-store" })
  const data = await r2.json()
  const users = data.users || []

  // 排序：先已抽，再未抽；名字为空的放后面
  users.sort((a, b) => {
    if (a.hasDrawn !== b.hasDrawn) return a.hasDrawn ? -1 : 1
    const an = a.name || ""
    const bn = b.name || ""
    return an.localeCompare(bn, "zh")
  })

  // 渲染
  if (users.length === 0) {
    drawsDiv.innerText = "暂无玩家登记/抽牌。"
    return
  }

  const rows = users.map(u => {
    const name = u.name ? u.name : "(未填名字)"
    const card = u.card ? u.card : "未抽"
    return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(card)}</td></tr>`
  }).join("")

  drawsDiv.innerHTML = `
    <table border="1" cellspacing="0" cellpadding="6">
      <thead><tr><th>玩家</th><th>身份</th></tr></thead>
      <tbody>${rows}</tbody>
      <p>轮次：${data.round || 0}</p>

    </table>
  `
}


async function syncNight() {
  const res = await fetch("/night/status", { cache: "no-store" })
  const data = await res.json()

  const status = data.nightOpen ? "🟢 夜晚进行中" : "🔴 夜晚未开始/已结束"
  const nightNo = data.night || 0

  const pending = data.pendingWolfTarget ? `今晚狼人目标（女巫可见）：${escapeHtml(data.pendingWolfTarget.name)}` : "今晚狼人目标：暂无/未投票"
  const guard = data.guardTarget ? `守卫守护：${escapeHtml(data.guardTarget.name)}` : "守卫守护：暂无"

  const witch = data.witch || {}
  const witchInfo = `女巫：解药${witch.antidoteUsed ? "已用" : "未用"}，毒药${witch.poisonUsed ? "已用" : "未用"}，今晚是否已用${witch.usedTonight ? "是" : "否"}`

  const voteSummary = data.voteSummary || {}
  const voteLines = Object.keys(voteSummary).length
    ? Object.entries(voteSummary).map(([wolfName, targetName]) => `<li>${escapeHtml(wolfName)} → ${escapeHtml(targetName)}</li>`).join("")
    : "<li>暂无</li>"

  const last = data.lastNightResult
  let lastHtml = "暂无"
  if (last) {
    const deaths = (last.deaths || []).length
      ? (last.deaths || []).map(d => `<li>${escapeHtml(d.name)}（${escapeHtml(d.reason)}）</li>`).join("")
      : "<li>无人死亡</li>"

    lastHtml = `
      <div>
        <div>第 ${last.night} 夜结算：</div>
        <ul>${deaths}</ul>
        <div>狼刀目标：${last.wolfTarget ? escapeHtml(last.wolfTarget.name) : "无"}</div>
        <div>守卫目标：${last.guardTarget ? escapeHtml(last.guardTarget.name) : "无"}</div>
        <div>被守住：${last.guarded ? "是" : "否"}，女巫救：${last.saved ? "是" : "否"}，女巫毒：${last.poisoned ? escapeHtml(last.poisoned.name) : "无"}</div>
      </div>
    `
  }

  nightPanel.innerHTML = `
    <p>${status}（第 ${nightNo} 夜）</p>
    <p>${pending}</p>
    <p>${guard}</p>
    <p>${witchInfo}</p>
    <p>狼人投票明细：</p>
    <ul>${voteLines}</ul>
    <hr />
    <p>上一夜结算：</p>
    ${lastHtml}
  `
}


async function syncVote() {
  const res = await fetch("/vote/status", { cache: "no-store" })
  const data = await res.json()

  // buttons
  voteStartBtn.disabled = !!data.voteOpen
  voteFinishBtn.disabled = !data.voteOpen

  const round = data.round || 0
  const status = data.voteOpen ? `🟢 投票进行中（第 ${round} 轮）` : "🔴 投票未开始/已结束"

  // eligible targets
  const targets = data.eligibleTargets || []
  const targetHtml = targets.length
    ? targets.map(t => `<li>${escapeHtml(t.name)}${t.role ? `（${escapeHtml(t.role)}）` : ""}</li>`).join("")
    : "<li>暂无</li>"

  // vote list
  const votes = data.votes || []
  const voteHtml = votes.length
    ? votes.map(v => `<li>${escapeHtml(v.voterName)} → ${escapeHtml(v.targetName)}</li>`).join("")
    : "<li>暂无</li>"

  // counts
  const counts = data.counts || {}
  const countLines = Object.keys(counts).length
    ? Object.entries(counts).map(([tid, c]) => {
        const t = targets.find(x => x.userId === tid)
        const name = t ? t.name : tid
        return `<li>${escapeHtml(name)}：${c} 票</li>`
      }).join("")
    : "<li>暂无</li>"

  // last result
  const lr = data.lastResult
  let lastHtml = "暂无"
  if (lr) {
    if (lr.runoff) {
      const tied = (lr.tiedCandidates || []).map(x => escapeHtml(x.name)).join("、") || "（未知）"
      lastHtml = `⚠️ 第1轮平票：${tied}，已进入第2轮复投`
    } else if (lr.idiotSaved) {
      lastHtml = `🧠 白痴得票最高但不出局：${escapeHtml(lr.winner?.name || "")}`
    } else if (lr.noElimination) {
      lastHtml = "⚠️ 无人出局（第二轮仍平票或无有效票）"
    } else if (lr.eliminated) {
      lastHtml = `✅ 出局：${escapeHtml(lr.eliminated.name)}（${escapeHtml(lr.eliminated.role)}）`
    } else {
      lastHtml = "✅ 已结算"
    }
  }

  votePanel.innerHTML = `
    <p>${status}</p>
    <p>可被投票的玩家：</p>
    <ul>${targetHtml}</ul>
    <p>投票明细：</p>
    <ul>${voteHtml}</ul>
    <p>当前票数：</p>
    <ul>${countLines}</ul>
    <hr />
    <p>上一轮结算：</p>
    <div>${lastHtml}</div>
  `
}


async function syncSheriff() {
  const res = await fetch("/sheriff/status", { cache: "no-store" })
  const data = await res.json()

  sheriffStartBtn.disabled = !(!data.electionOpen) // 未开启时可点
  sheriffFinishBtn.disabled = !(data.electionOpen) // 开启后可结束

  const candidates = data.candidates || []
  const votes = data.votes || []

  // 统计票数（按 targetId）
  const count = {}
  for (const c of candidates) count[c.userId] = 0
  for (const v of votes) {
    if (count[v.targetId] !== undefined) count[v.targetId]++
  }

  const candList = candidates.map(c => {
    const n = count[c.userId] ?? 0
    return `<li>${escapeHtml(c.name)}（${n} 票）</li>`
  }).join("")

  const voteList = votes.map(v => {
    return `<li>${escapeHtml(v.voterName)} → ${escapeHtml(v.targetName)}</li>`
  }).join("")

  const sheriffText = data.sheriff ? `✅ 警长：${escapeHtml(data.sheriff.name)}` : "（尚未产生警长）"

  sheriffPanel.innerHTML = `
    <p>状态：${data.electionOpen ? "🟢 进行中" : "🔴 未开启/已结束"}</p>
    <p>${sheriffText}</p>
    <p>上警名单：</p>
    <ul>${candList || "<li>暂无</li>"}</ul>
    <p>投票明细：</p>
    <ul>${voteList || "<li>暂无</li>"}</ul>
  `
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]))
}


function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]))
}


startBtn.onclick = async () => {
  const { players, counts, sum } = getConfigFromForm()

  if (!Number.isInteger(players) || players <= 0) {
    msg.innerText = "❌ 人数必须是正整数"
    return
  }
  // 前端先做一次提示，后端也会强校验
  if (sum !== players) {
    msg.innerText = `❌ 身份总数(${sum}) 必须等于 人数(${players})`
    return
  }

  const res = await fetch("/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players, counts }),
  })

  const data = await res.json()
  if (!res.ok) {
    msg.innerText = `❌ 开始失败：${data.error || "unknown error"}`
    return
  }
  await syncStatus()
}

sheriffStartBtn.onclick = async () => {
  const res = await fetch("/sheriff/start", { method: "POST" })
  const data = await res.json()
  if (!res.ok) {
    msg.innerText = `❌ 开启失败：${data.error || "unknown"}`
    return
  }
  await syncSheriff()
}


nightStartBtn.onclick = async () => {
  const res = await fetch("/night/start", { method: "POST" })
  const data = await res.json()
  if (!res.ok) msg.innerText = `❌ 夜晚开始失败：${data.error || "unknown"}`
}

nightEndBtn.onclick = async () => {
  const res = await fetch("/night/end", { method: "POST" })
  const data = await res.json()
  if (!res.ok) {
    msg.innerText = `❌ 夜晚结束失败：${data.error || "unknown"}`
    return
  }
  // data.result 里你会放死亡信息等
  msg.innerText = "✅ 夜晚已结算"
}


sheriffFinishBtn.onclick = async () => {
  const res = await fetch("/sheriff/finish", { method: "POST" })
  const data = await res.json()
    if (data.tie && data.runoff) {
    msg.innerText = "⚠️ 平票，进入第二轮复投（仅平票候选人可被投）"
  } else if (data.tie && data.noSheriff) {
    msg.innerText = "⚠️ 第二轮仍平票，本局无警长"
  } else if (data.winner) {
    msg.innerText = "✅ 警长已产生"
  } else {
    msg.innerText = "⚠️ 无有效结果"
  }

  if (!res.ok) {
    msg.innerText = `❌ 结束失败：${data.error || "unknown"}`
    return
  }

  if (data.tie) {
    msg.innerText = "⚠️ 本轮投票平票，未产生警长"
  } else if (data.winner) {
    msg.innerText = `✅ 警长产生：${data.winner}`
    // host 侧展示用名字已经在 syncSheriff 里做了
  } else {
    msg.innerText = "⚠️ 无有效票，未产生警长"
  }

  await syncSheriff()
}


voteStartBtn.onclick = async () => {
  const res = await fetch("/vote/start", { method: "POST" })
  const data = await res.json()
  if (!res.ok) {
    msg.innerText = `❌ 开始投票失败：${data.error || "unknown"}`
    return
  }
  await syncVote()
}

voteFinishBtn.onclick = async () => {
  const res = await fetch("/vote/finish", { method: "POST" })
  const data = await res.json()
  if (!res.ok) {
    msg.innerText = `❌ 结算失败：${data.error || "unknown"}`
    return
  }

  if (data.runoff) msg.innerText = "⚠️ 平票，进入第二轮复投"
  else if (data.noElimination) msg.innerText = "⚠️ 第二轮仍平票，无人出局"
  else if (data.idiotSaved) msg.innerText = "🧠 白痴得票最高，但不出局（已翻牌）"
  else if (data.eliminated) msg.innerText = `✅ 出局：${data.eliminated.name}`
  else msg.innerText = "✅ 已结算"

  await syncVote()
}




endBtn.onclick = async () => {
  const res = await fetch("/end", { method: "POST" })
  if (res.ok) syncStatus()
}

window.onload = () => {
  syncStatus()
  setInterval(syncStatus, 1000)
}
