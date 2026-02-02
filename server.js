const express = require("express")
const { startGame, endGame, isStarted } = require("./server/start")
const { drawCard, initDeck, remaining, SUPPORTED_ROLES } = require("./server/raffle")


const {
  ensureUser,
  setName,
  getName,
  hasDrawn,
  setCard,
  getCard,
  resetUsers,
  listUsers,
  isAlive,

getRole,

killUser,

setPendingShot,

hasPendingShot,

listPlayers,
} = require("./server/users")

const sheriff = require("./server/sheriff")
const night = require("./server/night")
const vote = require("./server/vote")





const app = express()
app.use(express.json())
app.use(express.static("public"))

function isNonNegInt(x) {
  return Number.isInteger(x) && x >= 0
}

app.get("/status", (req, res) => {
  res.json({
    started: isStarted(),
    remaining: remaining(),
  })
})

app.get("/night/status", (req, res) => {
  const userId = String(req.query.userId || "")
  const data = userId
    ? night.statusFor(userId, require("./server/users"))
    : night.hostStatus(require("./server/users"))
  res.json(data)
})


app.get("/players", (req, res) => {
  const players = listPlayers().map(p => ({
    userId: p.userId,
    name: p.name || "(未命名)",
    alive: p.alive,
  }))
  res.json({ players })
})


// ===== Night APIs =====

// host: start night
app.post("/night/start", (req, res) => {
  if (!isStarted()) return res.status(400).json({ error: "game not started" })
  const r = night.startNight()
  res.json(r)
})

// host: end night and settle
app.post("/night/end", (req, res) => {
  if (!isStarted()) return res.status(400).json({ error: "game not started" })
  const usersMod = require("./server/users")
  const r = night.endNight(usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// status (player view with userId OR host view without userId)
app.get("/night/status", (req, res) => {
  const usersMod = require("./server/users")
  const userId = String(req.query.userId || "")
  if (userId) {
    return res.json(night.statusFor(userId, usersMod))
  }
  return res.json(night.hostStatus(usersMod))
})

// wolf vote
app.post("/night/wolf", (req, res) => {
  const { userId, targetId } = req.body || {}
  const usersMod = require("./server/users")
  const r = night.wolfVote(userId, targetId, usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// seer check
app.post("/night/seer", (req, res) => {
  const { userId, targetId } = req.body || {}
  const usersMod = require("./server/users")
  const r = night.seerCheck(userId, targetId, usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// guard protect
app.post("/night/guard", (req, res) => {
  const { userId, targetId } = req.body || {}
  const usersMod = require("./server/users")
  const r = night.guardProtect(userId, targetId, usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// witch save
app.post("/night/witch/save", (req, res) => {
  const { userId } = req.body || {}
  const usersMod = require("./server/users")
  const r = night.witchSave(userId, usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// witch poison
app.post("/night/witch/poison", (req, res) => {
  const { userId, targetId } = req.body || {}
  const usersMod = require("./server/users")
  const r = night.witchPoison(userId, targetId, usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// hunter shoot (after death)
app.post("/night/hunter/shoot", (req, res) => {
  const { userId, targetId } = req.body || {}
  const usersMod = require("./server/users")
  const r = night.hunterShoot(userId, targetId, usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// for dropdown lists
app.get("/players", (req, res) => {
  const players = listPlayers().map(p => ({
    userId: p.userId,
    name: p.name || "(未命名)",
    alive: p.alive,
  }))
  res.json({ players })
})

// ===== Sheriff election APIs =====

// 主持人：开启警长竞选（举手 + 投票开始）
app.post("/sheriff/start", (req, res) => {
  if (!isStarted()) return res.status(400).json({ error: "game not started" })
  sheriff.startElection()
  res.json({ ok: true, round: snap.round,})
})
app.post("/night/start", (req, res) => {
  if (!isStarted()) return res.status(400).json({ error: "game not started" })
  night.startNight()
  res.json({ ok: true })
})

app.post("/night/end", (req, res) => {
  if (!isStarted()) return res.status(400).json({ error: "game not started" })
  const result = night.endNight(require("./server/users")) // 或者你把 users 模块变量传进去
  res.json({ ok: true, result })
})

// 玩家：上警
app.post("/sheriff/join", (req, res) => {
  const { userId } = req.body || {}
  if (!userId) return res.status(400).json({ error: "missing userId" })

  // 必须先有名字（避免匿名）
  const name = getName(userId)
  if (!name) return res.status(400).json({ error: "name required" })

  const r = sheriff.joinCandidate(userId)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json({ ok: true })
})

// 玩家：退警（但仍然永久失去投票资格）
app.post("/sheriff/leave", (req, res) => {
  const { userId } = req.body || {}
  if (!userId) return res.status(400).json({ error: "missing userId" })

  const r = sheriff.leaveCandidate(userId)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json({ ok: true })
})

// 玩家：投票给某个当前候选人（只有从未上警者可投）
app.post("/sheriff/vote", (req, res) => {
  const { userId, targetId } = req.body || {}
  if (!userId || !targetId) return res.status(400).json({ error: "missing userId/targetId" })

  // 必须先有名字
  const name = getName(userId)
  if (!name) return res.status(400).json({ error: "name required" })

  const r = sheriff.castVote(userId, targetId)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json({ ok: true })
})

// 主持人：结束投票并结算警长
app.post("/sheriff/finish", (req, res) => {
  const r = sheriff.finishElection()
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// 供玩家/主持人轮询展示
app.get("/sheriff/status", (req, res) => {
  const snap = sheriff.getSnapshot()

  // 把 userId 映射为名字，方便展示
  const candidates = snap.candidates.map(uid => ({ userId: uid, name: getName(uid) || "(未命名)" }))

  // votes: [[voterId, targetId]]
  const votes = snap.votes.map(([voterId, targetId]) => ({
    voterId,
    voterName: getName(voterId) || "(未命名)",
    targetId,
    targetName: getName(targetId) || "(未命名)",
  }))

  const sheriffId = snap.sheriffId
  res.json({
    electionOpen: snap.electionOpen,
    candidates,
    votes,
    sheriff: sheriffId ? { userId: sheriffId, name: getName(sheriffId) || "(未命名)" } : null,
  })
})


// 玩家提交名字（必须先 join 才能抽）
app.post("/join", (req, res) => {
  const { userId, name } = req.body || {}
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "invalid userId" })
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "invalid name" })
  }
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 32) {
    return res.status(400).json({ error: "name length 1-32" })
  }

  ensureUser(userId)
  setName(userId, trimmed)
  res.json({ ok: true, name: trimmed })
})

// 玩家刷新后查询自己状态（名字/身份）
app.get("/me", (req, res) => {
  const userId = String(req.query.userId || "")
  if (!userId) return res.status(400).json({ error: "missing userId" })

  const name = getName(userId)
  const card = getCard(userId)

    const alive = isAlive(userId)
  const role = getRole(userId) // same as card
  const pendingShot = hasPendingShot(userId)

  // death reason can be read from listPlayers snapshot
  let death = null
  const p = listPlayers().find(x => x.userId === userId)
  if (p) death = p.death || null

  res.json({
    userId,
    name,
    hasName: !!name,
    hasDrawn: !!card,
    card: card || null,
    role: role || null,

    alive,
    death,
    pendingShot,

    started: isStarted(),
    remaining: remaining(),
  })

})

// 主持人查看谁抽了什么
app.get("/draws", (req, res) => {
  res.json({
    started: isStarted(),
    remaining: remaining(),
    users: listUsers(),
  })
})


app.post("/start", (req, res) => {
  const { players, counts } = req.body || {}

  const p = Number(players)
  if (!Number.isInteger(p) || p <= 0) {
    return res.status(400).json({ error: "invalid players" })
  }
  if (!counts || typeof counts !== "object") {
    return res.status(400).json({ error: "invalid counts" })
  }

  let sum = 0
  for (const role of SUPPORTED_ROLES) {
    const n = Number(counts[role] ?? 0)
    if (!isNonNegInt(n)) {
      return res.status(400).json({ error: `invalid count for ${role}` })
    }
    sum += n
  }

  if (sum !== p) {
    return res.status(400).json({ error: `sum(${sum}) != players(${p})` })
  }

  startGame()
  initDeck(counts)
  resetUsers()
  sheriff.resetAll()

  res.json({ started: true, players: p, remaining: remaining() })
})

app.post("/end", (req, res) => {
  endGame()
  resetUsers()
  initDeck() 
  sheriff.resetAll()
  vote.resetAll()


  res.json({ ended: true })
})

app.post("/draw", (req, res) => {
  const { userId } = req.body || {}

  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "invalid userId" })
  }

  if (!isStarted()) {
    return res.status(403).json({ error: "not started" })
  }

  // 必须先有名字
  const name = getName(userId)
  if (!name) {
    return res.status(400).json({ error: "name required" })
  }

  // 如果已经抽过：直接返回同一张卡（不要报 already drawn）
  const existing = getCard(userId)
  if (existing) {
    return res.json({ card: existing, remaining: remaining(), already: true })
  }

  const card = drawCard()
  if (!card) {
    return res.status(400).json({ error: "card not found" })
  }

  setCard(userId, card)
  res.json({ card, remaining: remaining(), already: false })
})


// ===== Day Vote APIs =====

// host: start vote
app.post("/vote/start", (req, res) => {
  if (!isStarted()) return res.status(400).json({ error: "game not started" })
  const usersMod = require("./server/users")
  const r = vote.startVote(usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// player: cast vote
app.post("/vote/cast", (req, res) => {
  const { userId, targetId } = req.body || {}
  const usersMod = require("./server/users")
  const r = vote.castVote(userId, targetId, usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// host: finish (settle). If tie round1 -> runoff and voteOpen stays true.
app.post("/vote/finish", (req, res) => {
  const usersMod = require("./server/users")
  const r = vote.finishVote(usersMod)
  if (!r.ok) return res.status(400).json({ error: r.error })
  res.json(r)
})

// status (host if no userId; player if userId present)
app.get("/vote/status", (req, res) => {
  const usersMod = require("./server/users")
  const userId = String(req.query.userId || "")
  const data = userId ? vote.statusFor(userId, usersMod) : vote.hostStatus(usersMod)
  res.json(data)
})


const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`)
})
