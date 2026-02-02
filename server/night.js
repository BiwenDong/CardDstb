// server/night.js
// Night state machine + action collection + settlement

let nightOpen = false
let nightIndex = 0

// Night actions
const wolfVotes = new Map() // wolfId -> targetId
const seerDone = new Set()  // seerId used tonight
const seerHistory = new Map() // seerId -> [{ night, targetId, targetName, result }]
let guardTarget = null

// Witch per-game resources
let witchAntidoteUsed = false
let witchPoisonUsed = false

// Witch per-night limit
let witchUsedTonight = false
let witchActionTonight = null // { type: "save" } or { type: "poison", targetId }

// For witch info
let pendingWolfTarget = null // userId of victim (before save/guard), visible to witch during night

// Last settlement
let lastNightResult = null // { night, wolfTarget, guardTarget, saved, poisoned, deaths:[{userId,name,reason}] }

// Helpers
function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function requireNightOpen() {
  if (!nightOpen) return { ok: false, error: "night not open" }
  return { ok: true }
}

function startNight() {
  nightOpen = true
  nightIndex += 1

  wolfVotes.clear()
  seerDone.clear()
  guardTarget = null
  witchUsedTonight = false
  witchActionTonight = null
  pendingWolfTarget = null

  // lastNightResult stays for display
  return { ok: true, night: nightIndex }
}

// Compute wolf target from votes: max count, tie -> random among tied
function computeWolfTarget(users) {
  const counts = new Map() // targetId -> count

  for (const [wolfId, targetId] of wolfVotes.entries()) {
    if (!users.isAlive(wolfId)) continue
    // only wolves can vote
    if (users.getRole(wolfId) !== "狼人") continue
    if (!users.isAlive(targetId)) continue
    counts.set(targetId, (counts.get(targetId) || 0) + 1)
  }

  let best = 0
  let top = []
  for (const [tid, c] of counts.entries()) {
    if (c > best) {
      best = c
      top = [tid]
    } else if (c === best) {
      top.push(tid)
    }
  }
  if (top.length === 0) return null
  if (top.length === 1) return top[0]
  return randPick(top)
}

function endNight(users) {
  if (!nightOpen) return { ok: false, error: "night not open" }

  // 1) wolf target
  const wolfTarget = computeWolfTarget(users)
  pendingWolfTarget = wolfTarget

  // 2) guard blocks wolf kill if same target
  const guarded = wolfTarget && guardTarget && wolfTarget === guardTarget

  // 3) witch action (max 1 per night)
  let saved = false
  let poisoned = null

  if (witchActionTonight && !witchUsedTonight) {
    // should not happen (we always set witchUsedTonight together), but keep safe
    witchUsedTonight = true
  }

  if (witchActionTonight && witchUsedTonight) {
    if (witchActionTonight.type === "save") {
      // can only save a real wolfTarget that is not guarded, and antidote unused
      if (wolfTarget && !guarded && !witchAntidoteUsed) {
        saved = true
        witchAntidoteUsed = true
      }
    } else if (witchActionTonight.type === "poison") {
      const tid = witchActionTonight.targetId
      if (tid && users.isAlive(tid) && !witchPoisonUsed) {
        poisoned = tid
        witchPoisonUsed = true
      }
    }
  }

  // 4) apply deaths
  const deaths = []

  // wolf kill applies if exists and not guarded and not saved
  if (wolfTarget && !guarded && !saved && users.isAlive(wolfTarget)) {
    users.killUser(wolfTarget, "wolf")
    deaths.push({ userId: wolfTarget, name: users.getName(wolfTarget) || "(未命名)", reason: "wolf" })
  }

  // poison kill applies independently
  if (poisoned && users.isAlive(poisoned)) {
    users.killUser(poisoned, "poison")
    deaths.push({ userId: poisoned, name: users.getName(poisoned) || "(未命名)", reason: "poison" })
  }

  // 5) hunter trigger: only if died by wolf (vote later), NOT poison
  for (const d of deaths) {
    const role = users.getRole(d.userId)
    if (role === "猎人") {
      if (d.reason === "wolf" || d.reason === "vote") {
        users.setPendingShot(d.userId, true)
      } else {
        users.setPendingShot(d.userId, false)
      }
    }
  }

  // finish
  nightOpen = false

  lastNightResult = {
    night: nightIndex,
    wolfTarget: wolfTarget ? { userId: wolfTarget, name: users.getName(wolfTarget) || "(未命名)" } : null,
    guardTarget: guardTarget ? { userId: guardTarget, name: users.getName(guardTarget) || "(未命名)" } : null,
    guarded,
    saved,
    poisoned: poisoned ? { userId: poisoned, name: users.getName(poisoned) || "(未命名)" } : null,
    deaths,
  }

  // after settlement, pendingWolfTarget no longer needed for witch
  pendingWolfTarget = null

  return { ok: true, result: lastNightResult }
}

// ===== Night actions =====

function wolfVote(wolfId, targetId, users) {
  const r = requireNightOpen()
  if (!r.ok) return r

  if (!users.isAlive(wolfId)) return { ok: false, error: "dead cannot act" }
  if (users.getRole(wolfId) !== "狼人") return { ok: false, error: "not wolf" }

  if (!users.isAlive(targetId)) return { ok: false, error: "target not alive" }
  // optional: wolves can vote wolves? allow or deny. Here deny to reduce mistakes:
  // if (users.getRole(targetId) === "狼人") return { ok: false, error: "cannot target wolf" }

  wolfVotes.set(wolfId, targetId)
  return { ok: true }
}

function seerCheck(seerId, targetId, users) {
  const r = requireNightOpen()
  if (!r.ok) return r

  if (!users.isAlive(seerId)) return { ok: false, error: "dead cannot act" }
  if (users.getRole(seerId) !== "预言家") return { ok: false, error: "not seer" }
  if (seerDone.has(seerId)) return { ok: false, error: "already checked tonight" }

  if (!users.isAlive(targetId)) return { ok: false, error: "target not alive" }

  const targetRole = users.getRole(targetId)
  const result = targetRole === "狼人" ? "狼人" : "好人"

  seerDone.add(seerId)
  const arr = seerHistory.get(seerId) || []
  arr.push({
    night: nightIndex,
    targetId,
    targetName: users.getName(targetId) || "(未命名)",
    result,
  })
  seerHistory.set(seerId, arr)

  return { ok: true, result }
}

function guardProtect(guardId, targetId, users) {
  const r = requireNightOpen()
  if (!r.ok) return r

  if (!users.isAlive(guardId)) return { ok: false, error: "dead cannot act" }
  if (users.getRole(guardId) !== "守卫") return { ok: false, error: "not guard" }

  if (!users.isAlive(targetId)) return { ok: false, error: "target not alive" }
  guardTarget = targetId
  return { ok: true }
}

function witchSave(witchId, users) {
  const r = requireNightOpen()
  if (!r.ok) return r

  if (!users.isAlive(witchId)) return { ok: false, error: "dead cannot act" }
  if (users.getRole(witchId) !== "女巫") return { ok: false, error: "not witch" }

  if (witchUsedTonight) return { ok: false, error: "witch already used tonight" }
  if (witchAntidoteUsed) return { ok: false, error: "antidote already used" }

  // Save is only meaningful if there is a pending wolf target
  if (!pendingWolfTarget) return { ok: false, error: "no wolf target tonight" }

  witchUsedTonight = true
  witchActionTonight = { type: "save" }
  return { ok: true }
}

function witchPoison(witchId, targetId, users) {
  const r = requireNightOpen()
  if (!r.ok) return r

  if (!users.isAlive(witchId)) return { ok: false, error: "dead cannot act" }
  if (users.getRole(witchId) !== "女巫") return { ok: false, error: "not witch" }

  if (witchUsedTonight) return { ok: false, error: "witch already used tonight" }
  if (witchPoisonUsed) return { ok: false, error: "poison already used" }

  if (!users.isAlive(targetId)) return { ok: false, error: "target not alive" }

  witchUsedTonight = true
  witchActionTonight = { type: "poison", targetId }
  return { ok: true }
}

// Hunter shoot (not strictly "night", but part of death handling)
// Only if hunter has pendingShot=true AND hunter died by wolf/vote (we set pendingShot in settlement)
// target must be alive
function hunterShoot(hunterId, targetId, users) {
  // allow at any time (night/day), as long as pendingShot flag is on
  if (!users.hasPendingShot(hunterId)) return { ok: false, error: "no pending shot" }

  if (users.isAlive(hunterId)) return { ok: false, error: "hunter not dead" }
  if (!users.isAlive(targetId)) return { ok: false, error: "target not alive" }

  users.killUser(targetId, "hunter")
  users.setPendingShot(hunterId, false)
  return { ok: true }
}

// ===== Status views =====

function statusFor(userId, users) {
  const role = users.getRole(userId)
  const alive = users.isAlive(userId)

  const base = {
    nightOpen,
    night: nightIndex,
    alive,
    role,
    lastNightResult,
  }

  // dead players get minimal info (no actions)
  if (!alive) {
    return {
      ...base,
      canAct: false,
      pendingShot: users.hasPendingShot(userId),
    }
  }

  if (role === "狼人") {
    return {
      ...base,
      canAct: nightOpen,
      wolf: {
        votedTargetId: wolfVotes.get(userId) || null,
      },
    }
  }

  if (role === "预言家") {
    return {
      ...base,
      canAct: nightOpen && !seerDone.has(userId),
      seer: {
        canCheck: nightOpen && !seerDone.has(userId),
        history: seerHistory.get(userId) || [],
      },
    }
  }

  if (role === "守卫") {
    return {
      ...base,
      canAct: nightOpen,
      guard: {
        currentTargetId: guardTarget || null,
      },
    }
  }

  if (role === "女巫") {
    // Witch can see pending wolf target during night
    const wolfTarget = pendingWolfTarget
      ? { userId: pendingWolfTarget, name: users.getName(pendingWolfTarget) || "(未命名)" }
      : null

    return {
      ...base,
      canAct: nightOpen && !witchUsedTonight,
      witch: {
        canUseTonight: nightOpen && !witchUsedTonight,
        antidoteUsed: witchAntidoteUsed,
        poisonUsed: witchPoisonUsed,
        usedTonight: witchUsedTonight,
        pendingWolfTarget: wolfTarget,
      },
    }
  }

  if (role === "猎人") {
    return {
      ...base,
      canAct: false,
      hunter: {
        pendingShot: users.hasPendingShot(userId),
      },
    }
  }

  // 平民 / 白痴
  return {
    ...base,
    canAct: false,
  }
}

function hostStatus(users) {
  const players = users.listPlayers().map(p => ({
    userId: p.userId,
    name: p.name || "(未命名)",
    role: p.role,
    alive: p.alive,
    death: p.death,
  }))

  // summarize wolf votes by target name
  const voteSummary = {}
  for (const [wolfId, targetId] of wolfVotes.entries()) {
    const wolfName = users.getName(wolfId) || "(未命名)"
    const targetName = users.getName(targetId) || "(未命名)"
    voteSummary[wolfName] = targetName
  }

  return {
    nightOpen,
    night: nightIndex,
    guardTarget: guardTarget ? { userId: guardTarget, name: users.getName(guardTarget) || "(未命名)" } : null,
    pendingWolfTarget: pendingWolfTarget ? { userId: pendingWolfTarget, name: users.getName(pendingWolfTarget) || "(未命名)" } : null,
    witch: {
      antidoteUsed: witchAntidoteUsed,
      poisonUsed: witchPoisonUsed,
      usedTonight: witchUsedTonight,
      actionTonight: witchActionTonight,
    },
    voteSummary,
    lastNightResult,
    players,
  }
}

module.exports = {
  startNight,
  endNight,
  wolfVote,
  seerCheck,
  guardProtect,
  witchSave,
  witchPoison,
  hunterShoot,
  statusFor,
  hostStatus,
}
