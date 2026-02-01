const users = new Set()

const hasDrawn = (userId) => {
    return users.has(userId)
}

const markDrawn = (userId) => {
    users.add(userId)
}

const resetUsers = () => {
    users.clear()
}

module.exports = {
    hasDrawn,
    markDrawn,
    resetUsers
}
