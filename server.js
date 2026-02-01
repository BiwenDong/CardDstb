const express = require("express")
const { startGame, endGame, isStarted } = require("./server/start")
const { drawCard, initDeck, remaining} = require("./server/raffle")
const { hasDrawn, markDrawn, resetUsers } = require("./server/users")

const app = express()
app.use(express.json())
app.use(express.static("public"))

app.get("/status", (req, res) => {
    res.json({
        started: isStarted(),
        remaining: remaining,
    })
})

app.post("/start", (req, res) => {
    startGame()
    initDeck()
    res.json({ started: true })
})

app.post("/end", (req, res) => {
    endGame()
    resetUsers()
    initDeck()
    res.json({ ended: true })
})

app.post("/draw", (req, res) => {
    const { userId } = req.body

    if (!isStarted()) {
        return res.status(403).json({ error: "not started" })
    }

    if (hasDrawn(userId)) {
        return res.status(400).json({ error: "already drawn" })
    }

    const card = drawCard()
    if (!card) {
        return res.status(400).json({ error: "card not found" })
    }

    markDrawn(userId)
    res.json({ card })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})
