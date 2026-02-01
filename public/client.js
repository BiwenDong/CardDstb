let userId = localStorage.getItem("userId")
if (!userId) {
    userId = crypto.randomUUID()
    localStorage.setItem("userId", userId)
}
const statusText = document.getElementById("status")
const drawBtn = document.getElementById("drawBtn")
const resultDiv = document.getElementById("result")

async function fetchStatus() {
    const res = await fetch("/status")
    const data = await res.json()

    if (data.started) {
        statusText.innerText = `剩余 ${data.remaining} 张卡`
        drawBtn.disabled = false
    } else {
        statusText.innerText = "等待主持人开始游戏…"
        drawBtn.disabled = true
    }
}
drawBtn.onclick = async () => {
    const res = await fetch("/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
    })

    const data = await res.json()

    if (!res.ok) {
        resultDiv.innerText = data.error
        return
    }

    resultDiv.innerText = `🎉 ${data.card}`
    drawBtn.disabled = true
}


window.onload = fetchStatus
