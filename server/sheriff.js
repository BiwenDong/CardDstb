// server/sheriff.js

let round = 0  // 0=未开始, 1=第一轮, 2=复投轮

let electionOpen = false

// 当前上警的人（可随时退）
const candidates = new Set()

// 曾经上过警的人（只要上过一次，永远不能投票）
const everCandidate = new Set()

// voterId -> targetCandidateId
const votes = new Map()

// 最终警长 userId（结算后写入）
let sheriffId = null

function startElection() {
    round = 1

  electionOpen = true
  candidates.clear()
  votes.clear()
  sheriffId = null
  // 注意：everCandidate 不清（你希望“只要上过警就不能投票”，这是本轮内规则）
  // 如果你希望每局重置，放到 resetAll() 里清掉
}

function resetAll() {
  electionOpen = false
  candidates.clear()
  everCandidate.clear()
  votes.clear()
  sheriffId = null
  round = 0

}

function isElectionOpen() {
  return electionOpen
}

function joinCandidate(userId) {
  if (!electionOpen) return { ok: false, error: "election not open" }
  candidates.add(userId)
  everCandidate.add(userId)   // 上过一次 = 永远不能投票
  // 如果已经投过票，且他现在上警了：保持规则“上过警不能投票”，所以清掉他的票
  votes.delete(userId)
  return { ok: true }
}

function leaveCandidate(userId) {
  if (!electionOpen) return { ok: false, error: "election not open" }
  candidates.delete(userId)
  // 注意：everCandidate 不删！因为“退警后也不能投票”
  // 同时，如果有人投给他，可以选择保留/或自动作废。这里先保留到结算时再作废。
  return { ok: true }
}

function canVote(voterId) {
  // 只有“从来没上过警”的人可以投票
  return electionOpen && !everCandidate.has(voterId)
}

function castVote(voterId, targetId) {
  if (!electionOpen) return { ok: false, error: "election not open" }
  if (!canVote(voterId)) return { ok: false, error: "voter not eligible" }
  if (!candidates.has(targetId)) return { ok: false, error: "target not candidate" }

  votes.set(voterId, targetId)
  return { ok: true }
}

function tally() {
  // 只统计“当前仍在上警”的候选人票数；投给退警者的票作废
  const counts = new Map()
  for (const cid of candidates) counts.set(cid, 0)

  for (const [, targetId] of votes.entries()) {
    if (candidates.has(targetId)) {
      counts.set(targetId, counts.get(targetId) + 1)
    }
  }

  // 找最大值
  let winner = null
  let best = -1
  let tie = false
  for (const [cid, cnt] of counts.entries()) {
    if (cnt > best) {
      best = cnt
      winner = cid
      tie = false
    } else if (cnt === best && cnt !== -1) {
      tie = true
    }
  }

  if (winner && !tie) sheriffId = winner
  else sheriffId = null

  return { counts, winner: sheriffId, tie }
}

function finishElection() {
  if (!electionOpen) return { ok: false, error: "election not open" }
    if (!electionOpen) return { ok: false, error: "election not open" }

  // 先算本轮票数（只统计仍在 candidates 中的）
  const { counts } = tally()

  // 找最高票 & 平票集合
  let best = -1
  let top = []
  for (const [cid, cnt] of counts.entries()) {
    if (cnt > best) {
      best = cnt
      top = [cid]
    } else if (cnt === best) {
      top.push(cid)
    }
  }

  // 没候选人 或者 best 仍为 -1（极端情况）
  if (top.length === 0) {
    electionOpen = false
    sheriffId = null
    round = 0
    return { ok: true, winner: null, tie: false, noSheriff: true, round, counts: Object.fromEntries(counts.entries()) }
  }

  // 情况 A：唯一赢家
  if (top.length === 1) {
    sheriffId = top[0]
    electionOpen = false
    round = 0
    return { ok: true, winner: sheriffId, tie: false, round: 0, counts: Object.fromEntries(counts.entries()) }
  }

  // 情况 B：平票
  // 第一轮平票 -> 自动进入第二轮（复投），只保留平票候选人，清空 votes，保持 electionOpen=true
  if (round === 1) {
    // 限制候选人集合为平票者
    candidates.clear()
    for (const cid of top) candidates.add(cid)

    votes.clear()
    sheriffId = null
    round = 2

    return {
      ok: true,
      tie: true,
      runoff: true,
      round: 2,
      tiedCandidates: top,
      counts: Object.fromEntries(counts.entries()),
    }
  }

  // 第二轮仍平票 -> 本局无警长，结束竞选
  if (round === 2) {
    electionOpen = false
    sheriffId = null
    round = 0
    return {
      ok: true,
      tie: true,
      runoff: false,
      noSheriff: true,
      round: 0,
      tiedCandidates: top,
      counts: Object.fromEntries(counts.entries()),
    }
  }

  // 兜底
  electionOpen = false
  sheriffId = null
  round = 0
  return { ok: true, tie: true, runoff: false, noSheriff: true, round: 0, counts: Object.fromEntries(counts.entries()) }

  electionOpen = false

  return {
    ok: true,
    winner,
    tie,
    counts: Object.fromEntries(counts.entries()),
  }
}

function getSheriffId() {
  return sheriffId
}

function getSnapshot() {
  return {
    electionOpen,
    candidates: Array.from(candidates),
    everCandidate: Array.from(everCandidate),
    votes: Array.from(votes.entries()), // [[voterId, targetId], ...]
    sheriffId,
    round,

  }
}

module.exports = {
  startElection,
  finishElection,
  resetAll,
  isElectionOpen,
  joinCandidate,
  leaveCandidate,
  canVote,
  castVote,
  getSheriffId,
  getSnapshot,
}
