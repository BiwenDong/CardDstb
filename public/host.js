const startBtn = document.getElementById("startBtn")
const endBtn = document.getElementById("endBtn")
const msg = document.getElementById("msg")

async function syncStatus() {
    const res = await fetch("/status")
    const { started } = await res.json()

    startBtn.disabled = started
    endBtn.disabled = !started
    msg.innerText = started ? "🟢 游戏进行中" : "🔴 游戏未开始"
}

startBtn.onclick = async () => {
    const res = await fetch("/start", { method: "POST" })
    if (res.ok) syncStatus()
}

endBtn.onclick = async () => {
    const res = await fetch("/end", { method: "POST" })
    if (res.ok) syncStatus()
}

window.onload = () => {
    syncStatus()
    setInterval(syncStatus, 1000)
}
