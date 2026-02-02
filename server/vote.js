// server/vote.js
// Day vote state machine with 2-round runoff, idiot immunity, hunter pending shot on vote death.

let voteOpen = false
let round = 0 // 0=idle, 1=round1, 2=runoff
const votes = new Map() // voterId -> targetId
let eligibleTargets = new Set() // userIds, for current round
let lastResult = null // last settlement info

function resetAll() {
  voteOpen = false
  round = 0
  votes.clear()
  eligibleTargets = new Set()
  lastResult = null
}

function startVote(users) {
  if (voteOpen) return { ok: false, error: "vote already open" }

  // build eligible targets: alive players only
  const alive = users.listPlayers().filter(p => p.alive).map(p => p.userId)
  if (alive.length === 0) return { ok: false, error: "no alive players" }

  voteOpen = true
  round = 1
  votes.clear()
  eligibleTargets = new Set(alive)
  lastResult = null

  return {
    ok: true,
    voteOpen,
    round,
    eligibleTargetCount: eligibleTargets.size,
  }
}

function castVote(voterId, targetId, users) {
  if (!voteOpen) return { ok: false, error: "vote not open" }
  if (!voterId || !targetId) return { ok: false, error: "missing voterId/targetId" }

  // voter must be alive
  if (!users.isAlive(voterId)) return { ok: false, error: "dead cannot vote" }

  // target must be alive and eligible in this round
  if (!users.isAlive(targetId)) return { ok: false, error: "target not alive" }
  if (!eligibleTargets.has(targetId)) return { ok: false, error: "target not eligible this round" }

  // optional: disallow voting self (common rule). If you want to allow, remove this.
  if (voterId === targetId) return { ok: false, error: "cannot vote self" }

  // allow re-vote/overwrite until host finishes
  votes.set(voterId, targetId)
  return { ok: true }
}

function tally(users) {
  // Count votes for eligible targets only, from alive voters only
  const counts = new Map()
  for (const tid of eligibleTargets) {
    // only alive targets matter
    if (users.isAlive(tid)) counts.set(tid, 0)
  }

  for (const [voterId, targetId] of votes.entries()) {
    if (!users.isAlive(voterId)) continue
    if (!counts.has(targetId)) continue
    counts.set(targetId, counts.get(targetId) + 1)
  }

  // find top candidates
  let best = -1
  let top = []
  for (const [tid, c] of counts.entries()) {
    if (c > best) {
      best = c
      top = [tid]
    } else if (c === best) {
      top.push(tid)
    }
  }

  return { counts, best, top }
}

function finishVote(users) {
  if (!voteOpen) return { ok: false, error: "vote not open" }

  const { counts, best, top } = tally(users)

  // If no valid target (shouldn't happen if eligibleTargets non-empty)
  if (top.length === 0) {
    voteOpen = false
    round = 0
    eligibleTargets = new Set()
    lastResult = {
      roundFinished: round,
      noElimination: true,
      counts: Object.fromEntries(counts.entries()),
    }
    return { ok: true, ...lastResult }
  }

  // unique winner => apply elimination rules
  if (top.length === 1) {
    const winnerId = top[0]
    const winnerName = users.getName(winnerId) || "(未命名)"
    const winnerRole = users.getRole(winnerId)

    // idiot immunity to vote elimination
    if (winnerRole === "白痴") {
      users.setIdiotRevealed(winnerId, true)

      voteOpen = false
      round = 0
      eligibleTargets = new Set()

      lastResult = {
        roundFinished: round === 0 ? 1 : round,
        idiotSaved: true,
        eliminated: null,
        counts: Object.fromEntries(counts.entries()),
        winner: { userId: winnerId, name: winnerName, role: winnerRole },
      }
      return { ok: true, ...lastResult }
    }

    // normal elimination
    if (users.isAlive(winnerId)) {
      users.killUser(winnerId, "vote")
    }

    // hunter can shoot when died by vote (not poison)
    if (winnerRole === "猎人") {
      users.setPendingShot(winnerId, true)
    }

    voteOpen = false
    round = 0
    eligibleTargets = new Set()

    lastResult = {
      roundFinished: round === 0 ? 1 : round,
      eliminated: { userId: winnerId, name: winnerName, role: winnerRole },
      counts: Object.fromEntries(counts.entries()),
    }
    return { ok: true, ...lastResult }
  }

  // tie
  if (round === 1) {
    // runoff among tied candidates
    eligibleTargets = new Set(top)
    votes.clear()
    round = 2
    // voteOpen stays true

    lastResult = {
      roundFinished: 1,
      runoff: true,
      tiedCandidates: top.map(id => ({ userId: id, name: users.getName(id) || "(未命名)", role: users.getRole(id) })),
      counts: Object.fromEntries(counts.entries()),
      round: 2,
    }
    return { ok: true, ...lastResult }
  }

  if (round === 2) {
    // still tie => no elimination
    voteOpen = false
    round = 0
    eligibleTargets = new Set()

    lastResult = {
      roundFinished: 2,
      tie: true,
      noElimination: true,
      tiedCandidates: top.map(id => ({ userId: id, name: users.getName(id) || "(未命名)", role: users.getRole(id) })),
      counts: Object.fromEntries(counts.entries()),
    }
    return { ok: true, ...lastResult }
  }

  // fallback
  voteOpen = false
  round = 0
  eligibleTargets = new Set()
  lastResult = { roundFinished: 0, noElimination: true, counts: Object.fromEntries(counts.entries()) }
  return { ok: true, ...lastResult }
}

function statusFor(userId, users) {
  const alive = users.isAlive(userId)

  // build eligible target list with names (alive only)
  const targets = Array.from(eligibleTargets)
    .filter(tid => users.isAlive(tid))
    .map(tid => ({ userId: tid, name: users.getName(tid) || "(未命名)" }))

  return {
    voteOpen,
    round,
    alive,
    myVote: votes.get(userId) || null,
    eligibleTargets: targets,
    lastResult,
  }
}

function hostStatus(users) {
  const targets = Array.from(eligibleTargets)
    .filter(tid => users.isAlive(tid))
    .map(tid => ({ userId: tid, name: users.getName(tid) || "(未命名)", role: users.getRole(tid) }))

  // votes with names
  const voteList = Array.from(votes.entries()).map(([voterId, targetId]) => ({
    voterId,
    voterName: users.getName(voterId) || "(未命名)",
    targetId,
    targetName: users.getName(targetId) || "(未命名)",
  }))

  // counts (current round, live only)
  const { counts } = tally(users)

  return {
    voteOpen,
    round,
    eligibleTargets: targets,
    votes: voteList,
    counts: Object.fromEntries(counts.entries()),
    lastResult,
  }
}

module.exports = {
  resetAll,
  startVote,
  castVote,
  finishVote,
  statusFor,
  hostStatus,
}
