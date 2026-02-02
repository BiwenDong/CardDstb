function generateUUID() {
  if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

let userId = localStorage.getItem("userId")
if (!userId) {
  userId = generateUUID()
  localStorage.setItem("userId", userId)
}

const statusText = document.getElementById("status")
const drawBtn = document.getElementById("drawBtn")
const resultDiv = document.getElementById("result")
const runSheriffBtn = document.getElementById("runSheriffBtn")
const sheriffSelect = document.getElementById("sheriffSelect")
const voteSheriffBtn = document.getElementById("voteSheriffBtn")
const sheriffInfo = document.getElementById("sheriffInfo")
const voteSelect = document.getElementById("voteSelect")
const voteBtn = document.getElementById("voteBtn")
const voteInfo = document.getElementById("voteInfo")


const rolePanel = document.getElementById("rolePanel")

let roleRendered = false
let cachedRole = null

// keep references after render
let ui = {}


let iAmCandidate = false
let iEverCandidate = false // 只能通过 server 规则推断，这里用于前端提示


const nameInput = document.getElementById("nameInput")
const saveNameBtn = document.getElementById("saveNameBtn")

// 从本地加载名字（刷新仍保留）
let savedName = localStorage.getItem("playerName") || ""
nameInput.value = savedName

async function joinWithName(name) {
  const res = await fetch("/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, name }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "join failed")
  localStorage.setItem("playerName", data.name)
  return data.name
}

saveNameBtn.onclick = async () => {
  try {
    const name = (nameInput.value || "").trim()
    if (name.length < 1 || name.length > 32) {
      resultDiv.innerText = "❌ 名字长度必须 1-32"
      return
    }
    const n = await joinWithName(name)
    resultDiv.innerText = `✅ 已保存名字：${n}`
    await refreshMe()
  } catch (e) {
    resultDiv.innerText = `❌ 保存失败：${e.message}`
  }
}

async function refreshMe() {
  // 用 /me 来判断：是否有名字、是否已抽、身份是什么
  const res = await fetch(`/me?userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
  const me = await res.json()

  // status
  if (me.started) {
    statusText.innerText = `剩余 ${me.remaining} 张卡`
  } else {
    statusText.innerText = "等待主持人开始游戏…"
  }
  

  // 名字是否已在后端登记
  const hasName = !!me.name
  const hasDrawn = !!me.card

  // 如果已经抽过：持续显示身份 + 永远禁用按钮
  if (hasDrawn) {


    resultDiv.innerText = `🎭 你的身份：${me.card}`
    drawBtn.disabled = true
    if (!roleRendered && me.card) {
  cachedRole = me.card
  renderRolePanel(me.card)
  roleRendered = true
}

    await refreshSheriff()
    await refreshNightUI(me)
    await refreshVoteUI(me)


    return
  }

  // 没抽过：是否允许抽 = 游戏开始 AND 已有名字
  if (me.started && hasName) {
    drawBtn.disabled = false
  } else {
    drawBtn.disabled = true
    if (!hasName) {
      resultDiv.innerText = "请先输入并保存名字，然后才能抽牌。"
    }
  }
  await refreshSheriff()

}

async function refreshSheriff() {
  const res = await fetch("/sheriff/status", { cache: "no-store" })
  const data = await res.json()

  // 是否允许操作：必须游戏开始 + 已有名字 + electionOpen
  const meRes = await fetch(`/me?userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
  const me = await meRes.json()
  const hasName = !!me.name

  const open = !!data.electionOpen
  const canInteract = open && me.started && hasName

  // 候选人列表 & 我是否在候选人中
  const candidates = data.candidates || []
  iAmCandidate = candidates.some(c => c.userId === userId)
  if (iAmCandidate) iEverCandidate = true

  // 上警/退警按钮
  runSheriffBtn.disabled = !canInteract
  runSheriffBtn.innerText = iAmCandidate ? "✋ 退警（放手）" : "✋ 上警（举手）"

  // 下拉候选人
  sheriffSelect.innerHTML = ""
  for (const c of candidates) {
    const opt = document.createElement("option")
    opt.value = c.userId
    opt.innerText = c.name
    sheriffSelect.appendChild(opt)
  }

  // 投票按钮：前端条件只是“有候选人 + canInteract + 我不是候选人”
  // 真正资格由后端判定（everCandidate）
  const hasCandidate = candidates.length > 0
  voteSheriffBtn.disabled = !(canInteract && hasCandidate && !iAmCandidate)

  // 如果已经产生警长（投票结束后）
  if (!open && data.sheriff) {
    sheriffInfo.innerText = `✅ 本局警长：${data.sheriff.name}`
  } else if (open) {
    sheriffInfo.innerText = `竞选进行中（第 ${data.round || 1} 轮）：当前上警 ${candidates.length} 人`

  } else {
    sheriffInfo.innerText = "竞选未开启"
  }
}

async function refreshVoteUI(me) {
  if (!voteSelect || !voteBtn || !voteInfo) return

  const res = await fetch(`/vote/status?userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
  const vs = await res.json()

  // base conditions
  const open = !!vs.voteOpen
  const alive = !!me.alive
  const round = vs.round || 0

  // populate eligible targets (server already filters alive)
  const targets = vs.eligibleTargets || []
  const prev = voteSelect.value

  voteSelect.innerHTML = ""
  // exclude self to match server rule "cannot vote self"
  for (const t of targets) {
    if (t.userId === userId) continue
    const opt = document.createElement("option")
    opt.value = t.userId
    opt.innerText = t.name
    voteSelect.appendChild(opt)
  }

  // restore selection if possible
  const hasPrev = Array.from(voteSelect.options).some(o => o.value === prev)
  if (hasPrev) voteSelect.value = prev

  // enable/disable
  const canVoteNow = open && alive && voteSelect.options.length > 0
  voteBtn.disabled = !canVoteNow

  // show status text
  if (!alive) {
    voteInfo.innerText = "你已出局，无法投票"
  } else if (!open) {
    // show last result if any
    const lr = vs.lastResult
    if (!lr) voteInfo.innerText = "投票未开始"
    else if (lr.runoff) voteInfo.innerText = "上一轮平票，已进入第2轮复投"
    else if (lr.idiotSaved) voteInfo.innerText = "上一轮：白痴得票最高但不出局"
    else if (lr.noElimination) voteInfo.innerText = "上一轮：无人出局"
    else if (lr.eliminated) voteInfo.innerText = `上一轮：${lr.eliminated.name} 出局`
    else voteInfo.innerText = "上一轮：已结算"
  } else {
    voteInfo.innerText = `投票进行中（第 ${round} 轮）${vs.myVote ? "，你已投票（可修改）" : ""}`
  }

  // bind click once (idempotent by overwrite)
  voteBtn.onclick = async () => {
    const targetId = voteSelect.value
    if (!targetId) return

    const r2 = await fetch("/vote/cast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetId }),
    })
    const data = await r2.json()
    if (!r2.ok) {
      voteInfo.innerText = `❌ 投票失败：${data.error || "unknown"}`
      return
    }
    voteInfo.innerText = "✅ 投票成功（可在结算前修改）"
    // refresh to update myVote
    // (refreshMe will call again soon anyway)
  }
}



drawBtn.onclick = async () => {
  // 前端再兜底一次：必须先有名字
  const name = (nameInput.value || "").trim()
  if (!name) {
    resultDiv.innerText = "❌ 请先输入名字并保存"
    drawBtn.disabled = true
    return
  }

  try {
    // 如果本地名字变了但没点保存，也自动 join 一次
    const localSaved = localStorage.getItem("playerName") || ""
    if (localSaved !== name) {
      await joinWithName(name)
    }

    const res = await fetch("/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json()

    if (!res.ok) {
      // 不显示 already drawn（后端也不会这样返回了）
      resultDiv.innerText = `❌ 抽牌失败：${data.error || "unknown"}`
      drawBtn.disabled = true
      await refreshMe()
      return
    }

    // 成功抽到（或已抽过返回同一张）
    resultDiv.innerText = `🎭 你的身份：${data.card}`
    drawBtn.disabled = true // ✅ 抽完永远禁用
    location.reload()

    await refreshMe()
  } catch (e) {
    resultDiv.innerText = `❌ 抽牌异常：${e.message}`
    drawBtn.disabled = true
  }
}

runSheriffBtn.onclick = async () => {
  // 再兜底：必须先保存名字
  const meRes = await fetch(`/me?userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
  const me = await meRes.json()
  if (!me.name) {
    sheriffInfo.innerText = "❌ 请先保存名字后再上警/退警"
    return
  }

  const url = iAmCandidate ? "/sheriff/leave" : "/sheriff/join"
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  const data = await res.json()
  if (!res.ok) {
    sheriffInfo.innerText = `❌ 操作失败：${data.error || "unknown"}`
    return
  }
  await refreshSheriff()
}

voteSheriffBtn.onclick = async () => {
  const targetId = sheriffSelect.value
  if (!targetId) return

  const res = await fetch("/sheriff/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, targetId }),
  })
  const data = await res.json()
  if (!res.ok) {
    // 关键：退警后也不能投票 / 上过警就不能投票 -> 这里会返回 voter not eligible
    sheriffInfo.innerText = `❌ 投票失败：${data.error || "unknown"}`
    // 一旦失败，多半是“你不具备投票资格”，给点提示
    if ((data.error || "").includes("voter not eligible")) {
      iEverCandidate = true
      sheriffInfo.innerText += "（你上过警，因此失去投票资格）"
    }
    return
  }
  sheriffInfo.innerText = "✅ 投票成功"
  await refreshSheriff()
}


async function refreshNightUI(me) {
  if (!roleRendered || !cachedRole) return
  if (!ui || !ui.nightMsg) return

  // get night status for this user
  const res = await fetch(`/night/status?userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
  const ns = await res.json()

  // refresh target select (alive players)
  // (to keep it simple, re-fetch players each tick; later you can cache)
  const pr = await fetch("/players", { cache: "no-store" })
  const pdata = await pr.json()
  const players = pdata.players || []

  if (ui.targetSelect) {
    const prev = ui.targetSelect.value
    ui.targetSelect.innerHTML = ""

    // show only alive players, and exclude self by default
    const aliveList = players.filter(p => p.alive && p.userId !== userId)

    for (const p of aliveList) {
      const opt = document.createElement("option")
      opt.value = p.userId
      opt.innerText = p.name
      ui.targetSelect.appendChild(opt)
    }

    // restore selection if still exists
    const still = aliveList.some(p => p.userId === prev)
    if (still) ui.targetSelect.value = prev
  }

  // generic enable rule
  const canAct = !!(ns.nightOpen && me.alive)

  // base message
  if (!me.alive) {
    // dead: show death + hunter pending shot hint
    const extra = ns.pendingShot ? "（你可以开枪）" : ""
    ui.nightMsg.innerText = `你已出局 ${extra}`
  } else {
    ui.nightMsg.innerText = ns.nightOpen ? "夜晚进行中：可行动（若你有技能）" : "当前不是夜晚"
  }

  // disable everything first
  const disable = (el, v) => { if (el) el.disabled = v }
  disable(ui.wolfVoteBtn, true)
  disable(ui.seerCheckBtn, true)
  disable(ui.guardBtn, true)
  disable(ui.witchSaveBtn, true)
  disable(ui.witchPoisonBtn, true)
  disable(ui.hunterShootBtn, true)
  if (ui.hunterBox) ui.hunterBox.style.display = "none"

  // role-specific UI updates
  if (cachedRole === "狼人") {
    disable(ui.wolfVoteBtn, !canAct)
  }

  if (cachedRole === "预言家") {
    const canCheck = !!(ns.seer && ns.seer.canCheck)
    disable(ui.seerCheckBtn, !(canAct && canCheck))

    // history rendering
    if (ui.seerHistory) {
      const hist = (ns.seer && ns.seer.history) ? ns.seer.history : []
      if (hist.length === 0) ui.seerHistory.innerText = "暂无"
      else {
        ui.seerHistory.innerHTML = hist.map(h => `第${h.night}夜：${escapeHtml(h.targetName)} → ${escapeHtml(h.result)}`).join("<br/>")
      }
    }
  }

  if (cachedRole === "守卫") {
    disable(ui.guardBtn, !canAct)
  }

  if (cachedRole === "女巫") {
    if (ui.witchState && ns.witch) {
      const w = ns.witch
      const tgt = w.pendingWolfTarget ? `今晚被刀：${escapeHtml(w.pendingWolfTarget.name)}` : "今晚被刀：未知/暂无"
      ui.witchState.innerHTML = `
        <div>${tgt}</div>
        <div>解药：${w.antidoteUsed ? "已用" : "未用"}；毒药：${w.poisonUsed ? "已用" : "未用"}；本夜是否已用：${w.usedTonight ? "是" : "否"}</div>
      `
      const canUseTonight = canAct && w.canUseTonight
      // save only if there is pendingWolfTarget AND antidote not used
      const canSave = canUseTonight && !w.antidoteUsed && !!w.pendingWolfTarget
      const canPoison = canUseTonight && !w.poisonUsed
      disable(ui.witchSaveBtn, !canSave)
      disable(ui.witchPoisonBtn, !canPoison)
    }
  }

  if (cachedRole === "猎人") {
    const pending = !!(ns.hunter && ns.hunter.pendingShot)
    if (ui.hunterBox) ui.hunterBox.style.display = pending ? "block" : "none"
    disable(ui.hunterShootBtn, !pending) // pendingShot implies dead already
  }
}

// simple html escape used in history
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]))
}


function renderRolePanel(role) {
  // Static HTML skeleton, then we bind handlers & store refs in ui{}
  if (!rolePanel) return

  // Shared selects
  const baseSelect = `
    <select id="nightTargetSelect"></select>
  `

  if (role === "狼人") {
    rolePanel.innerHTML = `
      <hr/>
      <h3>🌙 夜晚行动：狼人</h3>
      <div>选择要刀的人：</div>
      ${baseSelect}
      <button id="wolfVoteBtn">提交刀人投票</button>
      <p id="nightMsg"></p>
    `
  } else if (role === "预言家") {
    rolePanel.innerHTML = `
      <hr/>
      <h3>🌙 夜晚行动：预言家</h3>
      <div>选择要查验的人：</div>
      ${baseSelect}
      <button id="seerCheckBtn">查验</button>
      <p id="seerResultNow"></p>
      <h4>历史查验</h4>
      <div id="seerHistory"></div>
      <p id="nightMsg"></p>
    `
  } else if (role === "守卫") {
    rolePanel.innerHTML = `
      <hr/>
      <h3>🌙 夜晚行动：守卫</h3>
      <div>选择要守护的人：</div>
      ${baseSelect}
      <button id="guardBtn">守护</button>
      <p id="nightMsg"></p>
    `
  } else if (role === "女巫") {
    rolePanel.innerHTML = `
      <hr/>
      <h3>🌙 夜晚行动：女巫</h3>
      <div id="witchState"></div>
      <div style="margin-top:8px;">
        <button id="witchSaveBtn">使用解药（救人）</button>
      </div>
      <div style="margin-top:8px;">
        <div>选择要毒的人：</div>
        ${baseSelect}
        <button id="witchPoisonBtn">使用毒药（毒人）</button>
      </div>
      <p id="nightMsg"></p>
    `
  } else if (role === "猎人") {
    rolePanel.innerHTML = `
      <hr/>
      <h3>⚔️ 猎人</h3>
      <div>当你因狼刀/投票出局时可开枪（被毒死不可开枪）。</div>
      <div id="hunterBox" style="margin-top:8px; display:none;">
        <div>选择要带走的人：</div>
        ${baseSelect}
        <button id="hunterShootBtn">开枪</button>
      </div>
      <p id="nightMsg"></p>
    `
  } else {
    rolePanel.innerHTML = `
      <hr/>
      <h3>🌙 夜晚行动</h3>
      <div>你没有夜晚技能。</div>
      <p id="nightMsg"></p>
    `
  }

  // cache refs
  ui.nightMsg = document.getElementById("nightMsg")
  ui.targetSelect = document.getElementById("nightTargetSelect")

  ui.wolfVoteBtn = document.getElementById("wolfVoteBtn")
  ui.seerCheckBtn = document.getElementById("seerCheckBtn")
  ui.seerResultNow = document.getElementById("seerResultNow")
  ui.seerHistory = document.getElementById("seerHistory")
  ui.guardBtn = document.getElementById("guardBtn")

  ui.witchState = document.getElementById("witchState")
  ui.witchSaveBtn = document.getElementById("witchSaveBtn")
  ui.witchPoisonBtn = document.getElementById("witchPoisonBtn")

  ui.hunterBox = document.getElementById("hunterBox")
  ui.hunterShootBtn = document.getElementById("hunterShootBtn")

  // bind handlers (they will be enabled/disabled by refreshNightUI)
  if (ui.wolfVoteBtn) {
    ui.wolfVoteBtn.onclick = async () => {
      const targetId = ui.targetSelect?.value
      const res = await fetch("/night/wolf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, targetId }),
      })
      const data = await res.json()
      ui.nightMsg.innerText = res.ok ? "✅ 已提交狼人投票" : `❌ ${data.error || "failed"}`
    }
  }

  if (ui.seerCheckBtn) {
    ui.seerCheckBtn.onclick = async () => {
      const targetId = ui.targetSelect?.value
      const res = await fetch("/night/seer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, targetId }),
      })
      const data = await res.json()
      if (res.ok) {
        ui.seerResultNow.innerText = `本夜查验结果：${data.result}`
      } else {
        ui.nightMsg.innerText = `❌ ${data.error || "failed"}`
      }
      // refresh to update history + disable state
      // (refreshMe will call refreshNightUI periodically anyway)
    }
  }

  if (ui.guardBtn) {
    ui.guardBtn.onclick = async () => {
      const targetId = ui.targetSelect?.value
      const res = await fetch("/night/guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, targetId }),
      })
      const data = await res.json()
      ui.nightMsg.innerText = res.ok ? "✅ 已提交守护目标" : `❌ ${data.error || "failed"}`
    }
  }

  if (ui.witchSaveBtn) {
    ui.witchSaveBtn.onclick = async () => {
      const res = await fetch("/night/witch/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      ui.nightMsg.innerText = res.ok ? "✅ 已选择使用解药" : `❌ ${data.error || "failed"}`
    }
  }

  if (ui.witchPoisonBtn) {
    ui.witchPoisonBtn.onclick = async () => {
      const targetId = ui.targetSelect?.value
      const res = await fetch("/night/witch/poison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, targetId }),
      })
      const data = await res.json()
      ui.nightMsg.innerText = res.ok ? "✅ 已选择使用毒药" : `❌ ${data.error || "failed"}`
    }
  }

  if (ui.hunterShootBtn) {
    ui.hunterShootBtn.onclick = async () => {
      const targetId = ui.targetSelect?.value
      const res = await fetch("/night/hunter/shoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, targetId }),
      })
      const data = await res.json()
      ui.nightMsg.innerText = res.ok ? "✅ 已开枪" : `❌ ${data.error || "failed"}`
    }
  }
}


window.onload = () => {
  refreshMe()
  setInterval(refreshMe, 1000)
}
