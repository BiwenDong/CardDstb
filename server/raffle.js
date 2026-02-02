let deck = []

const SUPPORTED_ROLES = ["狼人", "平民", "女巫", "预言家", "猎人", "守卫", "白痴"]

function buildDeckFromCounts(counts) {
  const newDeck = []
  for (const role of SUPPORTED_ROLES) {
    const n = Number(counts?.[role] ?? 0)
    for (let i = 0; i < n; i++) newDeck.push(role)
  }
  return newDeck
}

const initDeck = (counts) => {
  if (!counts) {
    deck = [
      "平民", "平民", "平民", "平民",
      "预言家", "女巫", "白痴", "猎人",
      "狼人", "狼人", "狼人", "狼人"
    ]
    return
  }
  deck = buildDeckFromCounts(counts)
}

const drawCard = () => {
  if (deck.length === 0) return null
  const index = Math.floor(Math.random() * deck.length)
  return deck.splice(index, 1)[0]
}

const remaining = () => deck.length

module.exports = {
  initDeck,
  drawCard,
  remaining,
  SUPPORTED_ROLES,
}
