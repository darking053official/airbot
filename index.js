// ╔══════════════════════════════════════════════════════════════╗
// ║                AIRBOT - Jubbio Bot                          ║
// ║   Moderasyon | Müzik | Eğlence | Bilgi | AI | Hava | Haber ║
// ╚══════════════════════════════════════════════════════════════╝

const { Client, GatewayIntentBits, EmbedBuilder, Colors } = require("@jubbio/core");
const http = require('http');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResourceFromUrl,
  probeAudioInfo,
  getVoiceConnection,
  AudioPlayerStatus,
} = require("@jubbio/voice");
const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");

// ─── Http Server ───────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    status: 'Çalıştı Laaaan', 
    bot: 'AIRBOT',
    time: new Date().toISOString() 
  }));
  
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ HTTP sunucusu ${PORT} portunda çalışıyor`);
});
// ─── Ortam Değişkenleri ───────────────────────────────────────────
const TOKEN       = process.env.BOT_TOKEN;
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const GNEWS_KEY   = process.env.GNEWS_API_KEY;
const MONGO_URL   = process.env.MONGO_URL;
const WEATHER_KEY = process.env.WEATHER_API_KEY;
const PORT = process.env.PORT
// ─── Hata Kodları ─────────────────────────────────────────────────
const HATALAR = {
  // Komut Hataları (1xxx)
  E1001: "❌ `[E1001]` Yanlış kullanım! Kullanım: ",
  E1002: "❌ `[E1002]` Geçersiz sayı değeri.",
  E1003: "❌ `[E1003]` Kullanıcı belirtilmedi. Kullanım: ",
  E1004: "❌ `[E1004]` Argüman eksik. Kullanım: ",
  E1005: "❌ `[E1005]` Bu komut sadece sunucularda kullanılabilir.",

  // Yetki Hataları (2xxx)
  E2001: "🚫 `[E2001]` Bu komutu kullanmak için **Ban Üyeleri** yetkisine sahip olmalısın.",
  E2002: "🚫 `[E2002]` Bu komutu kullanmak için **Üye At** yetkisine sahip olmalısın.",
  E2003: "🚫 `[E2003]` Bu komutu kullanmak için **Üye Sustur** yetkisine sahip olmalısın.",
  E2004: "🚫 `[E2004]` Bu komutu kullanmak için **Mesajları Yönet** yetkisine sahip olmalısın.",
  E2005: "🚫 `[E2005]` Bu komutu kullanmak için **Kanalları Yönet** yetkisine sahip olmalısın.",
  E2006: "🚫 `[E2006]` Hedef kullanıcı benden daha yüksek bir role sahip.",

  // API Hataları (3xxx)
  E3001: "⚠️ `[E3001]` Gemini AI şu an yanıt vermiyor. Lütfen tekrar dene.",
  E3002: "⚠️ `[E3002]` Gemini API anahtarı geçersiz veya kota aşıldı.",
  E3003: "⚠️ `[E3003]` Haber servisi şu an yanıt vermiyor.",
  E3004: "⚠️ `[E3004]` Bu konuda haber bulunamadı.",
  E3005: "⚠️ `[E3005]` Hava durumu servisi şu an yanıt vermiyor.",
  E3006: "⚠️ `[E3006]` Şehir bulunamadı. Şehir adını kontrol et.",
  E3007: "⚠️ `[E3007]` API isteği zaman aşımına uğradı. Lütfen tekrar dene.",

  // MongoDB Hataları (4xxx)
  E4001: "🗄️ `[E4001]` Veritabanı bağlantısı yok. Lütfen yöneticiyle iletişime geç.",
  E4002: "🗄️ `[E4002]` Veri kaydedilirken hata oluştu.",
  E4003: "🗄️ `[E4003]` Veri okunurken hata oluştu.",
  E4004: "🗄️ `[E4004]` Veri silinirken hata oluştu.",

  // Müzik Hataları (5xxx)
  E5001: "🎵 `[E5001]` Önce bir ses kanalına girmelisin.",
  E5002: "🎵 `[E5002]` Şu an çalan bir şarkı yok.",
  E5003: "🎵 `[E5003]` Bot henüz bir ses kanalında değil.",
  E5004: "🎵 `[E5004]` Şarkı çalınamadı. URL geçersiz veya erişilemiyor.",
  E5005: "🎵 `[E5005]` Ses kanalına bağlanılamadı.",
  E5006: "🎵 `[E5006]` Atlayacak şarkı yok.",
  E5007: "🎵 `[E5007]` Ses seviyesi 0-100 arasında olmalı.",
};

// Hata gönderici - hem kullanıcıya hem konsola loglar
function hata(ctx, kod, ek = "") {
  const kullanici = ctx.author?.username || ctx.user?.username || "bilinmiyor";
  const mesaj = HATALAR[kod] + ek;
  console.error(`[${kod}] Kullanıcı: ${kullanici} | ${mesaj}`);
  if (ctx.reply) return ctx.reply(mesaj);
  if (ctx.editReply) return ctx.editReply(mesaj);
}

// ─── MongoDB ──────────────────────────────────────────────────────
let db = null;
(async () => {
  try {
    const mongo = new MongoClient(MONGO_URL);
    await mongo.connect();
    db = mongo.db("airbot");
    console.log("✅ MongoDB bağlandı!");
  } catch (e) {
    console.error(`[E4001] MongoDB bağlantı hatası: ${e.message}`);
  }
})();

// ─── Jubbio Client ────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

// ─── Müzik Kuyruğu ───────────────────────────────────────────────
const queues  = new Map();
const players = new Map();

function getPlayer(guildId) {
  if (!players.has(guildId)) players.set(guildId, createAudioPlayer());
  return players.get(guildId);
}

function getQueue(guildId) {
  if (!queues.has(guildId)) queues.set(guildId, { songs: [], playing: false, volume: 100 });
  return queues.get(guildId);
}

async function playSong(guildId, channel) {
  const queue = getQueue(guildId);
  if (queue.songs.length === 0) { queue.playing = false; return; }

  const song = queue.songs[0];
  queue.playing = true;

  try {
    const info     = await probeAudioInfo(song.url);
    const resource = createAudioResourceFromUrl(info.url);
    const player   = getPlayer(guildId);
    player.play(resource);

    player.once(AudioPlayerStatus.Idle, () => {
      queue.songs.shift();
      playSong(guildId, channel);
    });

    const embed = new EmbedBuilder()
      .setTitle("🎵 Şimdi Çalıyor")
      .setDescription(`**${song.title}**`)
      .setColor(Colors.Blue)
      .addFields({ name: "İsteyen", value: `<@${song.requestedBy}>`, inline: true })
      .setTimestamp();
    if (info.thumbnail) embed.setThumbnail(info.thumbnail);
    channel.send({ embeds: [embed] });
  } catch (err) {
    console.error(`[E5004] Şarkı çalınamadı: ${err.message}`);
    channel.send(HATALAR.E5004);
    queue.songs.shift();
    playSong(guildId, channel);
  }
}

// ─── API Yardımcıları ─────────────────────────────────────────────

async function geminiSor(soru) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: soru }] }] }),
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Cevap alınamadı.";
}

async function haberGetir(konu) {
  const res = await fetch(
    `https://gnews.io/api/v4/search?q=${encodeURIComponent(konu)}&lang=tr&max=5&token=${GNEWS_KEY}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.articles || [];
}

async function havaDurumuGetir(sehir) {
  const res = await fetch(
    `https://api.weatherapi.com/v1/current.json?key=${WEATHER_KEY}&q=${encodeURIComponent(sehir)}&lang=tr`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function uyariEkle(guildId, userId, sebep, modId) {
  if (!db) throw new Error("E4001");
  try {
    await db.collection("uyarilar").insertOne({ guildId, userId, sebep, modId, tarih: new Date() });
    return db.collection("uyarilar").countDocuments({ guildId, userId });
  } catch (e) { throw new Error("E4002"); }
}

async function uyarilariGetir(guildId, userId) {
  if (!db) throw new Error("E4001");
  try {
    return db.collection("uyarilar").find({ guildId, userId }).toArray();
  } catch (e) { throw new Error("E4003"); }
}

async function uyarilariSil(guildId, userId) {
  if (!db) throw new Error("E4001");
  try {
    const r = await db.collection("uyarilar").deleteMany({ guildId, userId });
    return r.deletedCount;
  } catch (e) { throw new Error("E4004"); }
}

// ─── Ready ────────────────────────────────────────────────────────
client.on("ready", () => {
  console.log(`✅ ${client.user?.username} çevrimiçi!`);
});

// ─── Mesaj Komutları (! prefix) ───────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();

  // ════════════════════════════════════════════
  //  YARDIM & PING
  // ════════════════════════════════════════════

  if (cmd === "yardım" || cmd === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📖 AIRBOT Komutları")
      .setColor(Colors.Purple)
      .addFields(
        { name: "🎵 Müzik (/ prefix)",      value: "`/çal` `/dur` `/atla` `/kuyruk` `/ses` `/sesegir` `/sestençık`" },
        { name: "🛡️ Moderasyon (! prefix)", value: "`!ban` `!kick` `!mute` `!unmute` `!temizle` `!yavaşmod` `!uyar` `!uyarılar` `!uyarısil`" },
        { name: "🎉 Eğlence (! prefix)",     value: "`!zar` `!yazıtura` `!8top` `!kelime` `!şans`" },
        { name: "ℹ️ Bilgi (! prefix)",       value: "`!sunucubilgi` `!kullanıcıbilgi` `!ping`" },
        { name: "🤖 AI (! prefix)",          value: "`!ai <soru>` — Gemini ile soru sor" },
        { name: "📰 Haber (! prefix)",       value: "`!haber [konu]` — Güncel haberler" },
        { name: "🌤️ Hava (! prefix)",       value: "`!hava <şehir>` — Hava durumu" },
      )
      .setFooter({ text: "AIRBOT • Jubbio" })
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "ping") {
    const start = Date.now();
    const msg = await message.reply("🏓 Ölçülüyor...");
    return msg.edit(`🏓 Pong! \`${Date.now() - start}ms\``);
  }

  // ════════════════════════════════════════════
  //  MODERasyon
  // ════════════════════════════════════════════

  if (cmd === "ban") {
    if (!message.member?.permissions?.has("BanMembers")) return hata(message, "E2001");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!ban @kullanıcı [sebep]`");
    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    try {
      await user.ban({ reason });
      message.reply(`✅ **${user.user.username}** banlandı. Sebep: ${reason}`);
    } catch (e) {
      if (e.message?.includes("Missing Permissions")) return hata(message, "E2006");
      console.error("[BAN]", e.message);
      message.reply(`❌ Ban başarısız: ${e.message}`);
    }
    return;
  }

  if (cmd === "kick") {
    if (!message.member?.permissions?.has("KickMembers")) return hata(message, "E2002");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!kick @kullanıcı [sebep]`");
    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    try {
      await user.kick(reason);
      message.reply(`✅ **${user.user.username}** atıldı. Sebep: ${reason}`);
    } catch (e) {
      if (e.message?.includes("Missing Permissions")) return hata(message, "E2006");
      console.error("[KICK]", e.message);
      message.reply(`❌ Kick başarısız: ${e.message}`);
    }
    return;
  }

  if (cmd === "mute") {
    if (!message.member?.permissions?.has("ModerateMembers")) return hata(message, "E2003");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!mute @kullanıcı [dakika]`");
    const dakika = parseInt(args[1]) || 10;
    if (isNaN(dakika) || dakika < 1) return hata(message, "E1002");
    try {
      await user.timeout(dakika * 60 * 1000);
      message.reply(`🔇 **${user.user.username}** ${dakika} dakika susturuldu.`);
    } catch (e) {
      if (e.message?.includes("Missing Permissions")) return hata(message, "E2006");
      console.error("[MUTE]", e.message);
      message.reply(`❌ Mute başarısız: ${e.message}`);
    }
    return;
  }

  if (cmd === "unmute") {
    if (!message.member?.permissions?.has("ModerateMembers")) return hata(message, "E2003");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!unmute @kullanıcı`");
    try {
      await user.timeout(null);
      message.reply(`🔊 **${user.user.username}** susturmadan çıkarıldı.`);
    } catch (e) {
      console.error("[UNMUTE]", e.message);
      message.reply(`❌ Unmute başarısız: ${e.message}`);
    }
    return;
  }

  if (cmd === "temizle") {
    if (!message.member?.permissions?.has("ManageMessages")) return hata(message, "E2004");
    const sayi = parseInt(args[0]) || 10;
    if (isNaN(sayi) || sayi < 1 || sayi > 100) return hata(message, "E1002");
    try {
      await message.channel.bulkDelete(sayi);
      const bildirim = await message.channel.send(`🗑️ ${sayi} mesaj silindi.`);
      setTimeout(() => bildirim.delete().catch(() => {}), 3000);
    } catch (e) {
      console.error("[TEMIZLE]", e.message);
      message.reply(`❌ Silme başarısız: ${e.message}`);
    }
    return;
  }

  if (cmd === "yavaşmod") {
    if (!message.member?.permissions?.has("ManageChannels")) return hata(message, "E2005");
    const saniye = parseInt(args[0]);
    if (isNaN(saniye) || saniye < 0) return hata(message, "E1002");
    try {
      await message.channel.setRateLimitPerUser(saniye);
      message.reply(saniye === 0 ? "✅ Yavaş mod kapatıldı." : `⏱️ Yavaş mod **${saniye} saniye** olarak ayarlandı.`);
    } catch (e) {
      console.error("[YAVAŞMOD]", e.message);
      message.reply(`❌ Yavaş mod başarısız: ${e.message}`);
    }
    return;
  }

  if (cmd === "uyar") {
    if (!message.member?.permissions?.has("ModerateMembers")) return hata(message, "E2003");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!uyar @kullanıcı [sebep]`");
    const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
    try {
      const toplam = await uyariEkle(message.guild.id, user.id, sebep, message.author.id);
      message.reply(`⚠️ **${user.user.username}** uyarıldı. Sebep: ${sebep}\nToplam uyarı: **${toplam}**`);
    } catch (e) {
      return hata(message, HATALAR[e.message] ? e.message : "E4002");
    }
    return;
  }

  if (cmd === "uyarılar") {
    const user = message.mentions.members?.first() || message.member;
    try {
      const liste = await uyarilariGetir(message.guild.id, user.id);
      if (!liste.length) return message.reply(`✅ **${user.user.username}** adlı kullanıcının uyarısı yok.`);
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ ${user.user.username} Uyarıları`)
        .setColor(Colors.Yellow)
        .setDescription(liste.map((u, i) => `**${i + 1}.** ${u.sebep} — <t:${Math.floor(new Date(u.tarih).getTime() / 1000)}:R>`).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (e) {
      return hata(message, HATALAR[e.message] ? e.message : "E4003");
    }
    return;
  }

  if (cmd === "uyarısil") {
    if (!message.member?.permissions?.has("ModerateMembers")) return hata(message, "E2003");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!uyarısil @kullanıcı`");
    try {
      const silinen = await uyarilariSil(message.guild.id, user.id);
      message.reply(`✅ **${user.user.username}** adlı kullanıcının **${silinen}** uyarısı silindi.`);
    } catch (e) {
      return hata(message, HATALAR[e.message] ? e.message : "E4004");
    }
    return;
  }

  // ════════════════════════════════════════════
  //  EĞLENCE
  // ════════════════════════════════════════════

  if (cmd === "zar") {
    const sonuc = Math.floor(Math.random() * 6) + 1;
    const emojiler = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣"];
    return message.reply(`🎲 Zar sonucu: **${sonuc}** ${emojiler[sonuc - 1]}`);
  }

  if (cmd === "yazıtura") {
    return message.reply(`🪙 Sonuç: **${Math.random() < 0.5 ? "Yazı ✍️" : "Tura 🪙"}**`);
  }

  if (cmd === "8top") {
    if (!args.length) return hata(message, "E1004", "`!8top <soru>`");
    const cevaplar = [
      "Kesinlikle evet! ✅","Hayır. ❌","Belki... 🤔","Şüpheliyim 😐",
      "Çok olası! 🎯","Asla! 🚫","Evet, buna emin olabilirsin! 💯",
      "Şu an söylemek zor 🌀","Olabilir 🙂","Hayır derim ama yanılıyor olabilirim 😅",
    ];
    return message.reply(`🎱 **${args.join(" ")}**\n> ${cevaplar[Math.floor(Math.random() * cevaplar.length)]}`);
  }

  if (cmd === "kelime") {
    const kelimeler = ["Merhaba","Jubbio","Güneş","Deniz","Yıldız","Rüzgar","Bulut","Ateş","Toprak","Su","Bot","Kodlama","Müzik"];
    return message.reply(`🔤 Rastgele kelime: **${kelimeler[Math.floor(Math.random() * kelimeler.length)]}**`);
  }

  if (cmd === "şans") {
    const yuzde = Math.floor(Math.random() * 101);
    return message.reply(`${yuzde >= 70 ? "🍀" : yuzde >= 40 ? "😐" : "😬"} Bugünkü şans yüzden: **%${yuzde}**`);
  }

  // ════════════════════════════════════════════
  //  BİLGİ
  // ════════════════════════════════════════════

  if (cmd === "sunucubilgi") {
    if (!message.guild) return hata(message, "E1005");
    const g = message.guild;
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${g.name}`)
      .setColor(Colors.Green)
      .addFields(
        { name: "👥 Üye Sayısı",  value: `${g.memberCount}`, inline: true },
        { name: "🌐 Sunucu ID",   value: `${g.id}`,          inline: true },
        { name: "📅 Oluşturulma", value: `${new Date(g.createdAt).toLocaleDateString("tr-TR")}`, inline: true },
      )
      .setTimestamp();
    if (g.iconURL) embed.setThumbnail(g.iconURL());
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "kullanıcıbilgi") {
    const h = message.mentions.members?.first() || message.member;
    const embed = new EmbedBuilder()
      .setTitle(`👤 ${h.user.username}`)
      .setColor(Colors.Blurple)
      .addFields(
        { name: "🆔 ID",               value: `${h.id}`, inline: true },
        { name: "📅 Hesap Oluşturma",  value: `${new Date(h.user.createdAt).toLocaleDateString("tr-TR")}`, inline: true },
        { name: "📥 Sunucuya Katılma", value: h.joinedAt ? `${new Date(h.joinedAt).toLocaleDateString("tr-TR")}` : "Bilinmiyor", inline: true },
      )
      .setTimestamp();
    if (h.user.avatarURL) embed.setThumbnail(h.user.avatarURL());
    return message.reply({ embeds: [embed] });
  }

  // ════════════════════════════════════════════
  //  AI - GEMINI
  // ════════════════════════════════════════════

  if (cmd === "ai") {
    if (!args.length) return hata(message, "E1004", "`!ai <soru>`");
    const soru = args.join(" ");
    const bekle = await message.reply("🤖 Düşünüyorum...");
    try {
      const cevap = await geminiSor(soru);
      const embed = new EmbedBuilder()
        .setTitle("🤖 AIRBOT AI")
        .addFields(
          { name: "❓ Soru",   value: soru },
          { name: "💬 Cevap", value: cevap.slice(0, 1024) },
        )
        .setColor(Colors.Gold)
        .setFooter({ text: "Gemini AI tarafından yanıtlandı" })
        .setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch (e) {
      console.error("[E3001] Gemini:", e.message);
      bekle.edit(HATALAR[e.message?.includes("API key") ? "E3002" : "E3001"]);
    }
    return;
  }

  // ════════════════════════════════════════════
  //  HABER - GNEWS
  // ════════════════════════════════════════════

  if (cmd === "haber") {
    const konu = args.join(" ") || "türkiye";
    const bekle = await message.reply(`📰 **${konu}** haberleri aranıyor...`);
    try {
      const haberler = await haberGetir(konu);
      if (!haberler.length) return bekle.edit(HATALAR.E3004);
      const embed = new EmbedBuilder()
        .setTitle(`📰 "${konu}" Haberleri`)
        .setColor(Colors.Orange)
        .setDescription(
          haberler.map((h, i) => `**${i + 1}.** [${h.title}](${h.url})\n*${h.source?.name || "Kaynak yok"}*`).join("\n\n")
        )
        .setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch (e) {
      console.error("[E3003] GNews:", e.message);
      bekle.edit(HATALAR[e.message?.includes("timeout") ? "E3007" : "E3003"]);
    }
    return;
  }

  // ════════════════════════════════════════════
  //  HAVA DURUMU - WEATHERAPI
  // ════════════════════════════════════════════

  if (cmd === "hava") {
    if (!args.length) return hata(message, "E1004", "`!hava <şehir>`");
    const sehir = args.join(" ");
    const bekle = await message.reply(`🌤️ **${sehir}** hava durumu alınıyor...`);
    try {
      const data = await havaDurumuGetir(sehir);
      if (data.error) {
        console.error("[E3006]", data.error.message);
        return bekle.edit(HATALAR.E3006);
      }
      const c = data.current, l = data.location;
      const embed = new EmbedBuilder()
        .setTitle(`🌤️ ${l.name}, ${l.country}`)
        .setColor(Colors.Aqua)
        .addFields(
          { name: "🌡️ Sıcaklık",  value: `${c.temp_c}°C (Hissedilen: ${c.feelslike_c}°C)`, inline: true },
          { name: "💧 Nem",        value: `%${c.humidity}`,                                  inline: true },
          { name: "💨 Rüzgar",     value: `${c.wind_kph} km/s`,                              inline: true },
          { name: "☁️ Durum",      value: c.condition.text,                                  inline: true },
          { name: "👁️ Görüş",      value: `${c.vis_km} km`,                                  inline: true },
          { name: "🔆 UV İndeksi", value: `${c.uv}`,                                         inline: true },
        )
        .setFooter({ text: `Son güncelleme: ${c.last_updated}` })
        .setTimestamp();
      if (c.condition.icon) embed.setThumbnail(`https:${c.condition.icon}`);
      bekle.edit({ content: "", embeds: [embed] });
    } catch (e) {
      console.error("[E3005] WeatherAPI:", e.message);
      bekle.edit(HATALAR[e.message?.includes("timeout") ? "E3007" : "E3005"]);
    }
    return;
  }
});

// ─── Slash Komutları (/ prefix - Müzik) ──────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  const { commandName } = interaction;

  if (commandName === "sesegir") {
    const voiceChannelId = interaction.member?.voice?.channelId;
    if (!voiceChannelId) return interaction.reply({ content: HATALAR.E5001, ephemeral: true });
    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannelId,
        guildId: interaction.guildId,
        adapterCreator: client.voice.adapters.get(interaction.guildId),
      });
      connection.subscribe(getPlayer(interaction.guildId));
      interaction.reply("✅ Ses kanalına girildi!");
    } catch (e) {
      console.error("[E5005]", e.message);
      interaction.reply({ content: HATALAR.E5005, ephemeral: true });
    }
    return;
  }

  if (commandName === "sestençık") {
    const connection = getVoiceConnection(interaction.guildId);
    if (!connection) return interaction.reply({ content: HATALAR.E5003, ephemeral: true });
    connection.destroy();
    queues.delete(interaction.guildId);
    players.delete(interaction.guildId);
    interaction.reply("👋 Ses kanalından çıkıldı.");
    return;
  }

  if (commandName === "çal") {
    const sorgu = interaction.options.getString("şarkı", true);
    const voiceChannelId = interaction.member?.voice?.channelId;
    if (!voiceChannelId) return interaction.reply({ content: HATALAR.E5001, ephemeral: true });
    await interaction.deferReply();
    try {
      let connection = getVoiceConnection(interaction.guildId);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannelId,
          guildId: interaction.guildId,
          adapterCreator: client.voice.adapters.get(interaction.guildId),
        });
        connection.subscribe(getPlayer(interaction.guildId));
      }
      const queue = getQueue(interaction.guildId);
      queue.songs.push({ url: sorgu, title: sorgu, requestedBy: interaction.user.id });
      if (!queue.playing) {
        await playSong(interaction.guildId, interaction.channel);
        await interaction.editReply("▶️ Çalınıyor!");
      } else {
        await interaction.editReply(`✅ Kuyruğa eklendi: **${sorgu}** (Sıra: ${queue.songs.length})`);
      }
    } catch (e) {
      console.error("[E5005] Çal:", e.message);
      interaction.editReply(HATALAR.E5005);
    }
    return;
  }

  if (commandName === "dur") {
    const queue = getQueue(interaction.guildId);
    if (!queue.playing) return interaction.reply({ content: HATALAR.E5002, ephemeral: true });
    getPlayer(interaction.guildId).stop();
    queue.songs = [];
    queue.playing = false;
    interaction.reply("⏹️ Müzik durduruldu.");
    return;
  }

  if (commandName === "atla") {
    const queue = getQueue(interaction.guildId);
    if (!queue.playing || !queue.songs.length)
      return interaction.reply({ content: HATALAR.E5006, ephemeral: true });
    getPlayer(interaction.guildId).stop();
    interaction.reply("⏭️ Şarkı atlandı!");
    return;
  }

  if (commandName === "kuyruk") {
    const queue = getQueue(interaction.guildId);
    if (!queue.songs.length) return interaction.reply({ content: "📭 Kuyruk boş.", ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle("🎶 Müzik Kuyruğu")
      .setDescription(queue.songs.map((s, i) => `${i === 0 ? "▶️" : `${i}.`} **${s.title}** — <@${s.requestedBy}>`).join("\n"))
      .setColor(Colors.Blue)
      .setTimestamp();
    interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === "ses") {
    const seviye = interaction.options.getInteger("seviye", true);
    if (seviye < 0 || seviye > 100)
      return interaction.reply({ content: HATALAR.E5007, ephemeral: true });
    getQueue(interaction.guildId).volume = seviye;
    interaction.reply(`🔊 Ses seviyesi **%${seviye}** olarak ayarlandı.`);
    return;
  }
});

// ─── Global Hata Yönetimi ─────────────────────────────────────────
client.on("error", (err) => console.error("[CLIENT HATASI]", err.message));
process.on("unhandledRejection", (err) => console.error("[UnhandledRejection]", err));
process.on("uncaughtException",  (err) => console.error("[UncaughtException]",  err));

// ─── Başlat ───────────────────────────────────────────────────────
console.log("🤖 AIRBOT başlatılıyor...");
client.login(process.env.BOT_TOKEN);
