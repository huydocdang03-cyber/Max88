const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));

// ===== ACCOUNTS =====
const accounts = {
    admin: { password: "Tran2003", role: "admin", money: 0 },
    banker: { password: "Tran2003@", role: "banker", money: 10000 }
};

for (let i = 1; i <= 10; i++) {
    accounts["player" + i] = {
        password: "123",
        role: "player",
        money: 1000
    };
}

// ===== DATA =====
let users = {};
let bets = {};
let history = [];
let dealer = null;

let adminResult = null;
let currentResult = null;

let betting = false;
let countdown = 30;

let limit = { min: 1, max: 1000 };

// ===== RANDOM =====
function randomResult() {
    const items = ["Bầu", "Cua", "Tôm", "Cá", "Nai", "Gà"];
    return [
        items[Math.floor(Math.random() * 6)],
        items[Math.floor(Math.random() * 6)],
        items[Math.floor(Math.random() * 6)]
    ];
}

// ===== START ROUND =====
function startRound() {
    bets = {};
    betting = true;
    countdown = 30;

    // chọn kết quả
    if (adminResult && Array.isArray(adminResult)) {
        currentResult = adminResult;
    } else {
        currentResult = randomResult();
    }
    adminResult = null;

    // ẩn kết quả
    io.emit("dice_result", "🎲 🎲 🎲");

    // 👑 gửi riêng cho admin
    for (let id in users) {
        if (users[id].role === "admin" && currentResult) {
            io.to(id).emit("admin_result", currentResult);
        }
    }

    let timer = setInterval(() => {
        countdown--;
        io.emit("countdown", countdown);

        if (countdown <= 0) {
            clearInterval(timer);
            betting = false;
        }
    }, 1000);
}

// ===== SOCKET =====
io.on("connection", (socket) => {

    // ===== LOGIN =====
    socket.on("login", ({ username, password }) => {
        let acc = accounts[username];

        if (acc && acc.password === password) {
            users[socket.id] = {
                username,
                role: acc.role,
                money: acc.money
            };

            socket.emit("login_success", users[socket.id]);
            io.emit("users", users);

            // nếu chưa có dealer thì set tạm
            if (!dealer) dealer = username;
            io.emit("dealer", dealer);

            // bắt đầu game nếu chưa chạy
            if (!betting) startRound();

        } else {
            socket.emit("login_error");
        }
    });

    // ===== DISCONNECT =====
    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("users", users);
    });

    // ===== BANKER CHỌN DEALER =====
    socket.on("set_dealer", (name) => {
        let u = users[socket.id];
        if (!u || u.role !== "banker") return;

        dealer = name;
        io.emit("dealer", dealer);
    });

    // ===== BET =====
    socket.on("bet", ({ item, amount }) => {
        let u = users[socket.id];
        if (!u || !betting) return;

        if (amount < limit.min || amount > limit.max) return;

        if (!bets[item]) bets[item] = 0;
        bets[item] += amount;

        u.money -= amount;

        io.emit("bet_totals", bets);
        io.emit("users", users);
    });

    // ===== ADMIN SET =====
    socket.on("admin_set", (r) => {
        let u = users[socket.id];
        if (u.role === "admin") {
            adminResult = r.split(",");
        }
    });

    // ===== DEALER MỞ KẾT QUẢ =====
    socket.on("open_result", () => {
        let u = users[socket.id];

        // chỉ dealer mới mở
        if (!u || u.username !== dealer) return;

        // chưa hết 30s thì không mở
        if (betting) return;

        // trả thưởng
        for (let id in users) {
            let p = users[id];

            for (let item in bets) {
                let count = currentResult.filter(x => x === item).length;

                if (count > 0) {
                    p.money += bets[item] * count;
                }
            }
        }

        history.unshift({ result: currentResult });
        if (history.length > 10) history.pop();

        io.emit("dice_result", currentResult.join(" - "));
        io.emit("history", history);
        io.emit("users", users);

        // vòng mới
        startRound();
    });

    // ===== BANKER CHIP =====
    socket.on("add_chip", (d) => {
        let u = users[socket.id];
        if (u.role === "banker") {
            for (let id in users) {
                if (users[id].username === d.user) {
                    users[id].money += d.chip;
                }
            }
            io.emit("users", users);
        }
    });

    socket.on("sub_chip", (d) => {
        let u = users[socket.id];
        if (u.role === "banker") {
            for (let id in users) {
                if (users[id].username === d.user) {
                    users[id].money -= d.chip;
                }
            }
            io.emit("users", users);
        }
    });

    // ===== DEALER SET LIMIT =====
    socket.on("set_limit", (l) => {
        let u = users[socket.id];
        if (u && u.username === dealer) {
            limit = l;
            io.emit("limit", limit);
        }
    });

});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log("Server chạy cổng " + PORT);
});
