let started = false

const startGame = () => {
    started = true
}

const isStarted = () => started

const resetGame = () => {
    started = false
}

const endGame = () => {
    started = false
}

module.exports = {
    startGame,
    isStarted,
    resetGame,
    endGame,
}
