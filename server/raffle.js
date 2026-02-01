let deck = []

const initDeck = () => {
    deck = [
        "平民", "平民", "平民", "平民",
        "预言家", "女巫 ", "白痴", "猎人",
        "狼人", "狼人", "狼人", "狼人"
    ]
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
    remaining
}
