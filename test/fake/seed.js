(() => {
  const { seed, ts } = window.__fs, m = (min) => ts(Date.now() - min * 60000);
  const U = {
    me: { name: "Vegas", username: "vegas", status: "делаю Vela", about: "делаю игры и мессенджеры", badge: "founder", title: "Основатель", frame: "kotokrolik", presence: "on", hue: 20, c1: "#1d2b44", c2: "#0e1118" },
    dark: { name: "Dark|Fum", username: "darkfum", status: "катаю", badge: "check", frame: "fire", presence: "on", hue: 90 },
    max: { name: "Макс", username: "maks_x", frame: "neon", presence: "idle", hue: 200 },
    sasha: { name: "Сашка", presence: "dnd", hue: 300, title: "Легенда" }
  };
  for (const [uid, u] of Object.entries(U)) seed("users/" + uid, { code: "x", joined: m(9000), seen: uid === "sasha" ? m(300) : m(1), ...u });
  seed("admins/me", { ok: true });
  const dm = "dark_me";
  seed("chats/" + dm, { public: false, members: ["dark", "me"], created: m(5000), last: { uid: "me", text: "ура норм обнова", ts: m(2) }, reads: { me: m(1), dark: m(1) } });
  const msgs = [
    ["dark", "йо, глянь что получилось", 60], ["me", "щас гляну", 58], ["dark", "https://github.com/ — вот ссылка на репу", 55],
    ["me", "огонь, рамки норм встали", 40], ["dark", "а стрим работает?", 30], ["me", "да, 1080p 60 тянет", 29],
    ["dark", "длинное сообщение чтобы проверить перенос строк и как выглядит пузырь когда текста реально много, прямо очень много слов подряд без остановки", 20],
    ["me", "ура норм обнова", 2]
  ];
  msgs.forEach(([uid, text, min], i) => seed(`chats/${dm}/messages/m${i}`, { uid, text, ts: m(min) }));
  seed(`chats/${dm}/messages/f1`, { uid: "dark", text: "", file: { id: "x", name: "проект_финал_версия2.zip", size: 4200000, type: "application/zip" }, ts: m(25) });
  seed(`chats/${dm}/messages/c1`, { uid: "me", text: "", call: { video: true, dur: 133, miss: false }, ts: m(22) });
  seed(`chats/${dm}/messages/r1`, { uid: "dark", text: "согласен", reply: { id: "m5", uid: "me", text: "да, 1080p 60 тянет" }, re: { "🔥": ["me", "dark"], "😂": ["dark"] }, ts: m(10) });
  seed("chats/g1", { group: true, public: false, name: "Голда", about: "наша тусовка", owner: "me", members: ["me", "dark", "max", "sasha"], created: m(4000), last: { uid: "max", text: "кто в войс?", ts: m(5) }, voice: { dark: { t: m(3), mic: true, cam: false, scr: "" }, max: { t: m(3), mic: false, cam: false, scr: "" } } });
  [["max", "кто в войс?", 5], ["dark", "я уже там", 4], ["sasha", "через 5 минут", 3]].forEach(([uid, text, min], i) => seed(`chats/g1/messages/g${i}`, { uid, text, ts: m(min) }));
  seed("chats/max_me", { public: false, members: ["max", "me"], created: m(3000), last: { uid: "max", text: "скинь апк", ts: m(120) } });
})();
