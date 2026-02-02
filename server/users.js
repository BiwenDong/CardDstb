// userId -> { name: string, card: string|null }
const users = new Map()

const ensureUser = (userId) => {
  if (!users.has(userId)) users.set(userId, { name: null, card: null, alive: false, death: null, pendingShot: false, idiotRevealed: false })
  return users.get(userId)
}

const setName = (userId, name) => {
  const u = ensureUser(userId)
  u.name = name
}

const getName = (userId) => {
  const u = users.get(userId)
  return u ? u.name : null
}

const hasDrawn = (userId) => {
  const u = users.get(userId)
  return !!(u && u.card)
}

const setCard = (userId, card) => {
  const u = ensureUser(userId)
  u.card = card
u.alive = true
u.death = null
u.pendingShot = false
u.idiotRevealed = false


}

const getCard = (userId) => {
  const u = users.get(userId)
  return u ? u.card : null
}

const resetUsers = () => {
  users.clear()
}

const listUsers = () => {
  return Array.from(users.entries()).map(([userId, u]) => ({
    userId,
    name: u.name,
    card: u.card,
    hasDrawn: !!u.card,
  }))
}


const isAlive = (userId) => {
  const u = users.get(userId)
  return !!(u && u.alive)
}

const getRole = (userId) => {
  const u = users.get(userId)
  return u ? u.card : null
}

const killUser = (userId, reason) => {
  const u = users.get(userId)
  if (!u) return
  u.alive = false
  u.death = reason || "unknown"
}

const setPendingShot = (userId, val) => {
  const u = users.get(userId)
  if (!u) return
  u.pendingShot = !!val
}

const hasPendingShot = (userId) => {
  const u = users.get(userId)
  return !!(u && u.pendingShot)
}

const listPlayers = () => {
  return Array.from(users.entries()).map(([userId, u]) => ({
    userId,
    name: u.name,
    role: u.card,
    alive: u.alive,
    death: u.death,
    pendingShot: u.pendingShot,
  }))
}

const setIdiotRevealed = (userId, val) => {
  const u = users.get(userId)
  if (!u) return
  u.idiotRevealed = !!val
}

const isIdiotRevealed = (userId) => {
  const u = users.get(userId)
  return !!(u && u.idiotRevealed)
}



module.exports = {
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
    setIdiotRevealed,
isIdiotRevealed,


}
