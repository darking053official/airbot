// ╔══════════════════════════════════════════════════════════════════╗
// ║                    AIRBOT - Jubbio Bot                                       ║
// ║  Yönetici | Oyun | Genel | Ekonomi | Seviye | Müzik | AI                     ║
// ╚══════════════════════════════════════════════════════════════════╝

const { Client, GatewayIntentBits, EmbedBuilder, Colors } = require("@jubbio/core");
const { joinVoiceChannel, createAudioPlayer, createAudioResourceFromUrl, probeAudioInfo, getVoiceConnection, AudioPlayerStatus } = require("@jubbio/voice");
const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");
const http = require("http");

// ─── Ortam Değişkenleri ───────────────────────────────────────────
const TOKEN       = process.env.BOT_TOKEN;
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const GNEWS_KEY   = process.env.GNEWS_API_KEY;
const MONGO_URL   = process.env.MONGO_URL;
const WEATHER_KEY = process.env.WEATHER_API_KEY;

// ─── HTTP Sunucu (Port 10000) ─────────────────────────────────────
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online", bot: "AIRBOT", platform: "Jubbio" }));
}).listen(10000, () => console.log("🌐 HTTP sunucu port 10000'de çalışıyor."));

// ─── Hata Kodları ─────────────────────────────────────────────────
const HATALAR = {
  E1001: "❌ `[E1001]` Yanlış kullanım! Kullanım: ",
  E1002: "❌ `[E1002]` Geçersiz sayı değeri.",
  E1003: "❌ `[E1003]` Kullanıcı belirtilmedi. Kullanım: ",
  E1004: "❌ `[E1004]` Argüman eksik. Kullanım: ",
  E1005: "❌ `[E1005]` Bu komut sadece sunucularda kullanılabilir.",
  E2001: "🚫 `[E2001]` **Ban Üyeleri** yetkisine sahip olmalısın.",
  E2002: "🚫 `[E2002]` **Üye At** yetkisine sahip olmalısın.",
  E2003: "🚫 `[E2003]` **Üye Sustur** yetkisine sahip olmalısın.",
  E2004: "🚫 `[E2004]` **Mesajları Yönet** yetkisine sahip olmalısın.",
  E2005: "🚫 `[E2005]` **Kanalları Yönet** yetkisine sahip olmalısın.",
  E2006: "🚫 `[E2006]` Hedef kullanıcı benden daha yüksek role sahip.",
  E2007: "🚫 `[E2007]` **Yönetici** yetkisine sahip olmalısın.",
  E3001: "⚠️ `[E3001]` Gemini AI şu an yanıt vermiyor.",
  E3002: "⚠️ `[E3002]` Gemini API anahtarı geçersiz veya kota aşıldı.",
  E3005: "⚠️ `[E3005]` Hava durumu servisi yanıt vermiyor.",
  E3006: "⚠️ `[E3006]` Şehir bulunamadı.",
  E3007: "⚠️ `[E3007]` İstek zaman aşımına uğradı.",
  E4001: "🗄️ `[E4001]` Veritabanı bağlantısı yok.",
  E4002: "🗄️ `[E4002]` Veri kaydedilirken hata oluştu.",
  E4003: "🗄️ `[E4003]` Veri okunurken hata oluştu.",
  E4004: "🗄️ `[E4004]` Veri silinirken hata oluştu.",
  E5001: "🎵 `[E5001]` Önce bir ses kanalına girmelisin.",
  E5002: "🎵 `[E5002]` Şu an çalan bir şarkı yok.",
  E5003: "🎵 `[E5003]` Bot ses kanalında değil.",
  E5004: "🎵 `[E5004]` Şarkı çalınamadı.",
  E5005: "🎵 `[E5005]` Ses kanalına bağlanılamadı.",
  E5006: "🎵 `[E5006]` Atlayacak şarkı yok.",
  E5007: "🎵 `[E5007]` Ses seviyesi 0-100 arasında olmalı.",
  E6001: "💰 `[E6001]` Yetersiz bakiye.",
  E6002: "💰 `[E6002]` Geçersiz miktar.",
  E6003: "💰 `[E6003]` Bugünlük ödülünü zaten aldın.",
  E6004: "💰 `[E6004]` Ürün bulunamadı.",
};

function hata(ctx, kod, ek = "") {
  const kullanici = ctx.author?.username || ctx.user?.username || "?";
  const mesaj = HATALAR[kod] + ek;
  console.error(`[${kod}] ${kullanici}: ${mesaj}`);
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
    console.error(`[E4001] MongoDB: ${e.message}`);
  }
})();

// ─── DB Yardımcıları ──────────────────────────────────────────────
async function kullaniciyiGetir(guildId, userId) {
  if (!db) throw new Error("E4001");
  const col = db.collection("kullanicilar");
  let user = await col.findOne({ guildId, userId });
  if (!user) {
    user = { guildId, userId, para: 0, xp: 0, seviye: 1, envanter: [], uyarilar: [], afk: null, notlar: [], hatirlatmalar: [], olusturulma: new Date() };
    await col.insertOne(user);
  }
  return user;
}

async function kullaniciyiGuncelle(guildId, userId, guncelleme) {
  if (!db) throw new Error("E4001");
  await db.collection("kullanicilar").updateOne({ guildId, userId }, { $set: guncelleme }, { upsert: true });
}

async function paraEkle(guildId, userId, miktar) {
  if (!db) throw new Error("E4001");
  await db.collection("kullanicilar").updateOne({ guildId, userId }, { $inc: { para: miktar } }, { upsert: true });
}

async function xpEkle(guildId, userId, miktar) {
  if (!db) throw new Error("E4001");
  const user = await kullaniciyiGetir(guildId, userId);
  const yeniXp = (user.xp || 0) + miktar;
  const yeniSeviye = Math.floor(0.1 * Math.sqrt(yeniXp));
  const seviyeAtladi = yeniSeviye > (user.seviye || 1);
  await db.collection("kullanicilar").updateOne({ guildId, userId }, { $set: { xp: yeniXp, seviye: yeniSeviye } }, { upsert: true });
  return { seviyeAtladi, yeniSeviye };
}

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

// ─── Müzik ───────────────────────────────────────────────────────
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
  if (!queue.songs.length) { queue.playing = false; return; }
  const song = queue.songs[0];
  queue.playing = true;
  try {
    const info = await probeAudioInfo(song.url);
    const resource = createAudioResourceFromUrl(info.url);
    const player = getPlayer(guildId);
    player.play(resource);
    player.once(AudioPlayerStatus.Idle, () => { queue.songs.shift(); playSong(guildId, channel); });
    const embed = new EmbedBuilder().setTitle("🎵 Şimdi Çalıyor").setDescription(`**${song.title}**`).setColor(Colors.Blue).addFields({ name: "İsteyen", value: `<@${song.requestedBy}>`, inline: true }).setTimestamp();
    if (info.thumbnail) embed.setThumbnail(info.thumbnail);
    channel.send({ embeds: [embed] });
  } catch (err) {
    console.error(`[E5004] ${err.message}`);
    channel.send(HATALAR.E5004);
    queue.songs.shift();
    playSong(guildId, channel);
  }
}

// ─── API Yardımcıları ─────────────────────────────────────────────
async function geminiSor(prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Cevap alınamadı.";
}

async function havaDurumuGetir(sehir) {
  const res = await fetch(`https://api.weatherapi.com/v1/current.json?key=${WEATHER_KEY}&q=${encodeURIComponent(sehir)}&lang=tr`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Bilgi Yarışması Soruları ─────────────────────────────────────
const SORULAR = [
  { soru: "Türkiye'nin başkenti neresidir?", cevap: "ankara" },
  { soru: "En büyük okyanus hangisidir?", cevap: "büyük okyanus" },
  { soru: "Su'nun kimyasal formülü nedir?", cevap: "h2o" },
  { soru: "Güneş sistemimizdeki en büyük gezegen hangisidir?", cevap: "jüpiter" },
  { soru: "Türkiye kaç ilde bulunur?", cevap: "81" },
  { soru: "İstanbul'un eski adı nedir?", cevap: "konstantinopolis" },
  { soru: "Dünyanın en uzun nehri hangisidir?", cevap: "nil" },
  { soru: "Türkiye Cumhuriyeti ne zaman kuruldu?", cevap: "1923" },
  { soru: "Işığın hızı kaç km/s'dir? (yaklaşık)", cevap: "300000" },
  { soru: "Kaç tane gezegen var güneş sisteminde?", cevap: "8" },
  { soru: "Python hangi tür bir programlama dilidir?", cevap: "yorumlanan" },
  { soru: "Dünyanın en yüksek dağı hangisidir?", cevap: "everest" },
  { soru: "İnsan vücudunda kaç kemik vardır?", cevap: "206" },
  { soru: "Elmanın rengi genellikle ne renktir?", cevap: "kırmızı" },
  { soru: "Türkiye'nin para birimi nedir?", cevap: "türk lirası" },
];

// ─── Espriler ────────────────────────────────────────────────────
const ESPRILER = [
  "Neden bilgisayarlar hiç üşümez? Çünkü Windows'ları var! 😄",
  "Programcı markete gider. Karısı der ki: '1 ekmek al, süt varsa 6 tane al.' Programcı 6 ekmek alır. 😅",
  "Sormak bedava değil mi? Evet ama cevap da öyle! 😂",
  "Neden matematikçiler constipated olur? Çünkü logaritmalarla çalışırlar! 🤣",
  "Bot olmanın güzel yanı: Asla yorulmam. Kötü yanı: Asla uyuyamam. 😴",
  "Neden Java programcıları gözlük takar? Çünkü C# göremezler! 👓",
  "İki integer yürüyor... Float geçiyor yanlarından. Integer'lardan biri diğerine: 'Bak şu noktasını kaybetmiş!' 😆",
];

// ─── Market Ürünleri ──────────────────────────────────────────────
const MARKET = [
  { id: 1, isim: "🎭 VIP Rozet",    fiyat: 500,  aciklama: "Profilde özel VIP rozeti" },
  { id: 2, isim: "🎨 Renk Rolü",    fiyat: 300,  aciklama: "Özel renk rolü" },
  { id: 3, isim: "🔮 Şans Tılsımı", fiyat: 200,  aciklama: "Kumarda %10 bonus şans" },
  { id: 4, isim: "💎 XP Boost",     fiyat: 1000, aciklama: "24 saat 2x XP kazanımı" },
  { id: 5, isim: "🎁 Sürpriz Kutu", fiyat: 100,  aciklama: "50-500 arası rastgele para" },
];

// ─── Küfür Listesi ────────────────────────────────────────────────
const kufurListesi = new Map(); // guildId -> Set of words

// ─── Log Kanalı ──────────────────────────────────────────────────
const logKanallar = new Map(); // guildId -> channelId

async function log(guild, mesaj) {
  const kanalId = logKanallar.get(guild.id);
  if (!kanalId) return;
  try {
    const kanal = guild.channels.cache.get(kanalId);
    if (kanal) kanal.send(`📋 **LOG** | ${mesaj}`);
  } catch (e) { console.error("[LOG]", e.message); }
}

// ─── AFK Sistemi ──────────────────────────────────────────────────
const afklar = new Map(); // userId -> { sebep, zaman }

// ─── Hatırlatma Zamanlayıcıları ───────────────────────────────────
function sureyi_parse(sure) {
  const match = sure.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const sayi = parseInt(match[1]);
  const birim = match[2];
  const carpan = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return sayi * carpan[birim];
}

// ─── Ready ────────────────────────────────────────────────────────
client.on("ready", () => {
  console.log(`✅ ${client.user?.username} çevrimiçi!`);
});

// ─── XP - Her mesajda ─────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  // AFK kontrol
  if (afklar.has(message.author.id)) {
    afklar.delete(message.author.id);
    message.reply(`👋 AFK modundan çıktın.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  // Bahsedilen kullanıcı AFK mı?
  message.mentions.users.forEach(u => {
    if (afklar.has(u.id)) {
      const afk = afklar.get(u.id);
      message.reply(`💤 **${u.username}** şu an AFK. Sebep: ${afk.sebep}`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }
  });

  // Küfür filtresi
  const guildKufurler = kufurListesi.get(message.guild.id);
  if (guildKufurler) {
    const icerik = message.content.toLowerCase();
    for (const kufur of guildKufurler) {
      if (icerik.includes(kufur)) {
        message.delete().catch(() => {});
        message.channel.send(`⚠️ <@${message.author.id}>, uygunsuz kelime kullandın!`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        await log(message.guild, `Küfür: ${message.author.username} → "${message.content}"`);
        break;
      }
    }
  }

  // XP kazan (her mesajda 5-15 arası rastgele)
  try {
    const { seviyeAtladi, yeniSeviye } = await xpEkle(message.guild.id, message.author.id, Math.floor(Math.random() * 10) + 5);
    if (seviyeAtladi) {
      message.channel.send(`🎉 Tebrikler <@${message.author.id}>! **${yeniSeviye}. seviyeye** ulaştın!`);
      await log(message.guild, `Seviye atladı: ${message.author.username} → Seviye ${yeniSeviye}`);
    }
  } catch (e) { /* DB yoksa sessizce geç */ }

  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();

  // ════════════════════════════════════════════
  //  YARDIM & PING
  // ════════════════════════════════════════════

  if (cmd === "yardim" || cmd === "yardım") {
    const embed = new EmbedBuilder()
      .setTitle("📖 AIRBOT Komutları")
      .setColor(Colors.Purple)
      .addFields(
        { name: "👑 Yönetici (12)", value: "`!temizle` `!temizle-kullanici` `!uyar` `!uyarilar` `!sustur` `!susturma-kaldir` `!ban` `!kick` `!banlist` `!duyuru` `!kilit` `!yavasmod`" },
        { name: "🎮 Oyun (6)",      value: "`!zar` `!yazitura` `!sayitahmin` `!bilgiyarisma` `!espri` `!8ball`" },
        { name: "📝 Genel (15)",    value: "`!ping` `!kullanici` `!sunucu` `!avatar` `!random` `!istatistik` `!afk` `!not` `!notlar` `!notsil` `!hatirlat` `!davet` `!destek` `!havadurumu`" },
        { name: "💰 Ekonomi (8)",   value: "`!gunluk` `!cal` `!market` `!satinal` `!envanter` `!kumar` `!piyango` `!transfer`" },
        { name: "📈 Seviye (3)",    value: "`!seviye` `!liderlik` `!xp`" },
        { name: "🎵 Sesli (9)",     value: "`/sesligel` `/sesliçık` `/dur` `/çal` `/oynat` `/sıra` `/geç` `/geri` `/öneri`" },
        { name: "🤖 AI (7)",        value: "`!ai` `!sohbet` `!yorumla` `!ozetle` `!cevir` `!soru`" },
        { name: "⚙️ Ayarlar (2)",   value: "`!logkanal` `!kufurlistesi`" },
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
  //  YÖNETİCİ KOMUTLARI
  // ════════════════════════════════════════════

  if (cmd === "temizle") {
    if (!message.member?.permissions?.has("ManageMessages")) return hata(message, "E2004");
    const sayi = parseInt(args[0]) || 10;
    if (isNaN(sayi) || sayi < 1 || sayi > 100) return hata(message, "E1002");
    try {
      await message.channel.bulkDelete(sayi);
      const b = await message.channel.send(`🗑️ ${sayi} mesaj silindi.`);
      setTimeout(() => b.delete().catch(() => {}), 3000);
      await log(message.guild, `Temizle: ${message.author.username} → ${sayi} mesaj`);
    } catch (e) { message.reply(`❌ Hata: ${e.message}`); }
    return;
  }

  if (cmd === "temizle-kullanici") {
    if (!message.member?.permissions?.has("ManageMessages")) return hata(message, "E2004");
    const user = message.mentions.members?.first();
    const sayi = parseInt(args[1]) || 10;
    if (!user) return hata(message, "E1003", "`!temizle-kullanici @kullanıcı <sayı>`");
    if (isNaN(sayi) || sayi < 1 || sayi > 100) return hata(message, "E1002");
    try {
      const msgs = await message.channel.messages.fetch({ limit: 100 });
      const filtered = msgs.filter(m => m.author.id === user.id).first(sayi);
      await message.channel.bulkDelete(filtered);
      const b = await message.channel.send(`🗑️ ${user.user.username} kullanıcısından ${filtered.length} mesaj silindi.`);
      setTimeout(() => b.delete().catch(() => {}), 3000);
    } catch (e) { message.reply(`❌ Hata: ${e.message}`); }
    return;
  }

  if (cmd === "uyar") {
    if (!message.member?.permissions?.has("ModerateMembers")) return hata(message, "E2003");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!uyar @kullanıcı <sebep>`");
    const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
    try {
      const userData = await kullaniciyiGetir(message.guild.id, user.id);
      const uyarilar = [...(userData.uyarilar || []), { sebep, mod: message.author.id, tarih: new Date() }];
      await kullaniciyiGuncelle(message.guild.id, user.id, { uyarilar });
      message.reply(`⚠️ **${user.user.username}** uyarıldı. Sebep: ${sebep} | Toplam: **${uyarilar.length}**`);
      await log(message.guild, `Uyarı: ${user.user.username} → ${sebep} (Mod: ${message.author.username})`);
    } catch (e) { hata(message, HATALAR[e.message] ? e.message : "E4002"); }
    return;
  }

  if (cmd === "uyarilar") {
    const user = message.mentions.members?.first() || message.member;
    try {
      const userData = await kullaniciyiGetir(message.guild.id, user.id);
      const uyarilar = userData.uyarilar || [];
      if (!uyarilar.length) return message.reply(`✅ **${user.user.username}** uyarısı yok.`);
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ ${user.user.username} Uyarıları`)
        .setColor(Colors.Yellow)
        .setDescription(uyarilar.map((u, i) => `**${i + 1}.** ${u.sebep} — <t:${Math.floor(new Date(u.tarih).getTime() / 1000)}:R>`).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (e) { hata(message, "E4003"); }
    return;
  }

  if (cmd === "sustur") {
    if (!message.member?.permissions?.has("ModerateMembers")) return hata(message, "E2003");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!sustur @kullanıcı <dakika>`");
    const dakika = parseInt(args[1]) || 10;
    if (isNaN(dakika) || dakika < 1) return hata(message, "E1002");
    try {
      await user.timeout(dakika * 60 * 1000);
      message.reply(`🔇 **${user.user.username}** ${dakika} dakika susturuldu.`);
      await log(message.guild, `Sustur: ${user.user.username} → ${dakika}dk (Mod: ${message.author.username})`);
    } catch (e) {
      if (e.message?.includes("Missing Permissions")) return hata(message, "E2006");
      message.reply(`❌ Hata: ${e.message}`);
    }
    return;
  }

  if (cmd === "susturma-kaldir") {
    if (!message.member?.permissions?.has("ModerateMembers")) return hata(message, "E2003");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!susturma-kaldir @kullanıcı`");
    try {
      await user.timeout(null);
      message.reply(`🔊 **${user.user.username}** susturmadan çıkarıldı.`);
      await log(message.guild, `Susturma kaldır: ${user.user.username} (Mod: ${message.author.username})`);
    } catch (e) { message.reply(`❌ Hata: ${e.message}`); }
    return;
  }

  if (cmd === "ban") {
    if (!message.member?.permissions?.has("BanMembers")) return hata(message, "E2001");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!ban @kullanıcı <sebep>`");
    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    try {
      await user.ban({ reason });
      message.reply(`✅ **${user.user.username}** banlandı. Sebep: ${reason}`);
      await log(message.guild, `Ban: ${user.user.username} → ${reason} (Mod: ${message.author.username})`);
    } catch (e) {
      if (e.message?.includes("Missing Permissions")) return hata(message, "E2006");
      message.reply(`❌ Hata: ${e.message}`);
    }
    return;
  }

  if (cmd === "kick") {
    if (!message.member?.permissions?.has("KickMembers")) return hata(message, "E2002");
    const user = message.mentions.members?.first();
    if (!user) return hata(message, "E1003", "`!kick @kullanıcı <sebep>`");
    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    try {
      await user.kick(reason);
      message.reply(`✅ **${user.user.username}** sunucudan atıldı. Sebep: ${reason}`);
      await log(message.guild, `Kick: ${user.user.username} → ${reason} (Mod: ${message.author.username})`);
    } catch (e) {
      if (e.message?.includes("Missing Permissions")) return hata(message, "E2006");
      message.reply(`❌ Hata: ${e.message}`);
    }
    return;
  }

  if (cmd === "banlist") {
    if (!message.member?.permissions?.has("BanMembers")) return hata(message, "E2001");
    try {
      const bans = await message.guild.bans.fetch();
      if (!bans.size) return message.reply("✅ Banlanan kullanıcı yok.");
      const embed = new EmbedBuilder()
        .setTitle(`🔨 Ban Listesi (${bans.size})`)
        .setColor(Colors.Red)
        .setDescription(bans.map(b => `**${b.user.username}** — ${b.reason || "Sebep yok"}`).slice(0, 20).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (e) { message.reply(`❌ Hata: ${e.message}`); }
    return;
  }

  if (cmd === "duyuru") {
    if (!message.member?.permissions?.has("Administrator")) return hata(message, "E2007");
    const duyuruMesaj = args.join(" ");
    if (!duyuruMesaj) return hata(message, "E1004", "`!duyuru <mesaj>`");
    const embed = new EmbedBuilder()
      .setTitle("📢 DUYURU")
      .setDescription(duyuruMesaj)
      .setColor(Colors.Red)
      .setFooter({ text: `Duyuran: ${message.author.username}` })
      .setTimestamp();
    message.channel.send({ embeds: [embed] });
    message.delete().catch(() => {});
    return;
  }

  if (cmd === "kilit") {
    if (!message.member?.permissions?.has("ManageChannels")) return hata(message, "E2005");
    try {
      const herkes = message.guild.roles.everyone;
      const izinler = message.channel.permissionOverwrites.cache.get(herkes.id);
      const kilitli = izinler?.deny?.has("SendMessages");
      await message.channel.permissionOverwrites.edit(herkes, { SendMessages: kilitli ? null : false });
      message.reply(kilitli ? "🔓 Kanal kilidi açıldı." : "🔒 Kanal kilitlendi.");
      await log(message.guild, `Kilit: #${message.channel.name} → ${kilitli ? "açıldı" : "kilitlendi"}`);
    } catch (e) { message.reply(`❌ Hata: ${e.message}`); }
    return;
  }

  if (cmd === "yavasmod") {
    if (!message.member?.permissions?.has("ManageChannels")) return hata(message, "E2005");
    const saniye = parseInt(args[0]);
    if (isNaN(saniye) || saniye < 0) return hata(message, "E1002");
    try {
      await message.channel.setRateLimitPerUser(saniye);
      message.reply(saniye === 0 ? "✅ Yavaş mod kapatıldı." : `⏱️ Yavaş mod **${saniye} saniye** ayarlandı.`);
    } catch (e) { message.reply(`❌ Hata: ${e.message}`); }
    return;
  }

  // ════════════════════════════════════════════
  //  OYUN KOMUTLARI
  // ════════════════════════════════════════════

  if (cmd === "zar") {
    const sonuc = Math.floor(Math.random() * 6) + 1;
    return message.reply(`🎲 Zar: **${sonuc}** ${ ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣"][sonuc - 1] }`);
  }

  if (cmd === "yazitura") {
    return message.reply(`🪙 **${Math.random() < 0.5 ? "Yazı ✍️" : "Tura 🪙"}**`);
  }

  if (cmd === "sayitahmin") {
    const sayi = Math.floor(Math.random() * 10) + 1;
    await message.reply("🔢 1-10 arası bir sayı düşündüm. 30 saniye içinde yaz!");
    const filter = m => m.author.id === message.author.id && !isNaN(m.content);
    try {
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] });
      const tahmin = parseInt(collected.first().content);
      if (tahmin === sayi) {
        message.channel.send(`🎉 Doğru! Sayı **${sayi}** idi!`);
        await paraEkle(message.guild.id, message.author.id, 50);
      } else {
        message.channel.send(`❌ Yanlış! Sayı **${sayi}** idi.`);
      }
    } catch { message.channel.send(`⏰ Süre doldu! Sayı **${sayi}** idi.`); }
    return;
  }

  if (cmd === "bilgiyarisma") {
    const soru = SORULAR[Math.floor(Math.random() * SORULAR.length)];
    await message.reply(`❓ **${soru.soru}**\n30 saniye içinde cevapla!`);
    const filter = m => m.author.id === message.author.id;
    try {
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ["time"] });
      const cevap = collected.first().content.toLowerCase().trim();
      if (cevap === soru.cevap) {
        message.channel.send(`🎉 Doğru! **${soru.cevap.toUpperCase()}** +100 coin kazandın!`);
        await paraEkle(message.guild.id, message.author.id, 100);
      } else {
        message.channel.send(`❌ Yanlış! Doğru cevap: **${soru.cevap.toUpperCase()}**`);
      }
    } catch { message.channel.send(`⏰ Süre doldu! Cevap: **${soru.cevap.toUpperCase()}**`); }
    return;
  }

  if (cmd === "espri") {
    return message.reply(ESPRILER[Math.floor(Math.random() * ESPRILER.length)]);
  }

  if (cmd === "8ball") {
    if (!args.length) return hata(message, "E1004", "`!8ball <soru>`");
    const cevaplar = ["Kesinlikle evet! ✅","Hayır. ❌","Belki... 🤔","Şüpheliyim 😐","Çok olası! 🎯","Asla! 🚫","Evet! 💯","Şu an söylemek zor 🌀","Olabilir 🙂","Sanmıyorum 😅"];
    return message.reply(`🎱 **${args.join(" ")}**\n> ${cevaplar[Math.floor(Math.random() * cevaplar.length)]}`);
  }

  // ════════════════════════════════════════════
  //  GENEL KOMUTLAR
  // ════════════════════════════════════════════

  if (cmd === "kullanici") {
    const hedef = message.mentions.members?.first() || message.member;
    const embed = new EmbedBuilder()
      .setTitle(`👤 ${hedef.user.username}`)
      .setColor(Colors.Blurple)
      .addFields(
        { name: "🆔 ID",               value: hedef.id, inline: true },
        { name: "📅 Hesap Oluşturma",  value: new Date(hedef.user.createdAt).toLocaleDateString("tr-TR"), inline: true },
        { name: "📥 Sunucuya Katılma", value: hedef.joinedAt ? new Date(hedef.joinedAt).toLocaleDateString("tr-TR") : "?", inline: true },
      ).setTimestamp();
    if (hedef.user.avatarURL) embed.setThumbnail(hedef.user.avatarURL());
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "sunucu") {
    if (!message.guild) return hata(message, "E1005");
    const g = message.guild;
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${g.name}`)
      .setColor(Colors.Green)
      .addFields(
        { name: "👥 Üye",        value: `${g.memberCount}`, inline: true },
        { name: "🌐 ID",         value: g.id, inline: true },
        { name: "📅 Kurulma",    value: new Date(g.createdAt).toLocaleDateString("tr-TR"), inline: true },
      ).setTimestamp();
    if (g.iconURL) embed.setThumbnail(g.iconURL());
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "avatar") {
    const hedef = message.mentions.members?.first() || message.member;
    const url = hedef.user.avatarURL ? hedef.user.avatarURL({ size: 512 }) : null;
    if (!url) return message.reply("❌ Avatar bulunamadı.");
    const embed = new EmbedBuilder().setTitle(`🖼️ ${hedef.user.username} avatarı`).setImage(url).setColor(Colors.Blurple);
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "random") {
    const min = parseInt(args[0]) || 1;
    const max = parseInt(args[1]) || 100;
    if (min >= max) return hata(message, "E1002");
    return message.reply(`🎲 ${min}-${max} arası rastgele sayı: **${Math.floor(Math.random() * (max - min + 1)) + min}**`);
  }

  if (cmd === "istatistik") {
    try {
      const userData = await kullaniciyiGetir(message.guild.id, message.author.id);
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${message.author.username} İstatistikleri`)
        .setColor(Colors.Gold)
        .addFields(
          { name: "💰 Para",    value: `${userData.para || 0} coin`, inline: true },
          { name: "📈 Seviye",  value: `${userData.seviye || 1}`, inline: true },
          { name: "⭐ XP",      value: `${userData.xp || 0}`, inline: true },
          { name: "⚠️ Uyarı",  value: `${(userData.uyarilar || []).length}`, inline: true },
          { name: "📦 Envanter",value: `${(userData.envanter || []).length} ürün`, inline: true },
        ).setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (e) { hata(message, "E4003"); }
    return;
  }

  if (cmd === "afk") {
    const sebep = args.join(" ") || "Sebep belirtilmedi";
    afklar.set(message.author.id, { sebep, zaman: new Date() });
    message.reply(`💤 AFK moduna geçildi. Sebep: **${sebep}**`);
    return;
  }

  if (cmd === "not") {
    const notMesaj = args.join(" ");
    if (!notMesaj) return hata(message, "E1004", "`!not <mesaj>`");
    try {
      const userData = await kullaniciyiGetir(message.guild.id, message.author.id);
      const notlar = [...(userData.notlar || []), { id: Date.now(), metin: notMesaj, tarih: new Date() }];
      await kullaniciyiGuncelle(message.guild.id, message.author.id, { notlar });
      message.reply(`📝 Not kaydedildi! ID: \`${notlar[notlar.length - 1].id}\``);
    } catch (e) { hata(message, "E4002"); }
    return;
  }

  if (cmd === "notlar") {
    try {
      const userData = await kullaniciyiGetir(message.guild.id, message.author.id);
      const notlar = userData.notlar || [];
      if (!notlar.length) return message.reply("📭 Hiç notun yok.");
      const embed = new EmbedBuilder()
        .setTitle("📝 Notların")
        .setColor(Colors.Yellow)
        .setDescription(notlar.map(n => `\`${n.id}\` — ${n.metin}`).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (e) { hata(message, "E4003"); }
    return;
  }

  if (cmd === "notsil") {
    const notId = parseInt(args[0]);
    if (!notId) return hata(message, "E1004", "`!notsil <id>`");
    try {
      const userData = await kullaniciyiGetir(message.guild.id, message.author.id);
      const notlar = (userData.notlar || []).filter(n => n.id !== notId);
      await kullaniciyiGuncelle(message.guild.id, message.author.id, { notlar });
      message.reply(`✅ Not silindi.`);
    } catch (e) { hata(message, "E4004"); }
    return;
  }

  if (cmd === "hatirlat") {
    if (args.length < 2) return hata(message, "E1004", "`!hatirlat <süre(1s/1m/1h/1d)> <mesaj>`");
    const ms = sureyi_parse(args[0]);
    if (!ms) return message.reply("❌ Geçersiz süre. Örnek: `30s`, `5m`, `2h`, `1d`");
    const hatirlatmaMesaj = args.slice(1).join(" ");
    message.reply(`⏰ **${args[0]}** sonra seni hatırlatacağım: "${hatirlatmaMesaj}"`);
    setTimeout(() => {
      message.channel.send(`⏰ <@${message.author.id}> Hatırlatma: **${hatirlatmaMesaj}**`);
    }, ms);
    return;
  }

  if (cmd === "davet") {
    message.reply(`📨 Botu sunucuna eklemek için: https://jubbio.com/bot/invite\n🌐 Destek sunucusu: https://jubbio.com/support`);
    return;
  }

  if (cmd === "destek") {
    message.reply(`🆘 Destek için: contact@jubbio.com\n💬 Destek sunucusu: https://jubbio.com/support`);
    return;
  }

  if (cmd === "havadurumu") {
    if (!args.length) return hata(message, "E1004", "`!havadurumu <şehir>`");
    const sehir = args.join(" ");
    const bekle = await message.reply(`🌤️ **${sehir}** için hava durumu alınıyor...`);
    try {
      const data = await havaDurumuGetir(sehir);
      if (data.error) { console.error("[E3006]", data.error.message); return bekle.edit(HATALAR.E3006); }
      const c = data.current, l = data.location;
      const embed = new EmbedBuilder()
        .setTitle(`🌤️ ${l.name}, ${l.country}`)
        .setColor(Colors.Aqua)
        .addFields(
          { name: "🌡️ Sıcaklık",  value: `${c.temp_c}°C (Hissedilen: ${c.feelslike_c}°C)`, inline: true },
          { name: "💧 Nem",        value: `%${c.humidity}`, inline: true },
          { name: "💨 Rüzgar",     value: `${c.wind_kph} km/s`, inline: true },
          { name: "☁️ Durum",      value: c.condition.text, inline: true },
          { name: "👁️ Görüş",      value: `${c.vis_km} km`, inline: true },
          { name: "🔆 UV",         value: `${c.uv}`, inline: true },
        )
        .setFooter({ text: `Son güncelleme: ${c.last_updated}` })
        .setTimestamp();
      if (c.condition.icon) embed.setThumbnail(`https:${c.condition.icon}`);
      bekle.edit({ content: "", embeds: [embed] });
    } catch (e) {
      console.error("[E3005]", e.message);
      bekle.edit(HATALAR[e.message?.includes("timeout") ? "E3007" : "E3005"]);
    }
    return;
  }

  // ════════════════════════════════════════════
  //  EKONOMİ KOMUTLARI
  // ════════════════════════════════════════════

  if (cmd === "gunluk") {
    try {
      const userData = await kullaniciyiGetir(message.guild.id, message.author.id);
      const sonGunluk = userData.sonGunluk ? new Date(userData.sonGunluk) : null;
      const simdi = new Date();
      if (sonGunluk && (simdi - sonGunluk) < 86400000) {
        const kalan = 86400000 - (simdi - sonGunluk);
        const saat = Math.floor(kalan / 3600000);
        const dakika = Math.floor((kalan % 3600000) / 60000);
        return message.reply(`⏰ ${HATALAR.E6003} Kalan süre: **${saat}s ${dakika}d**`);
      }
      const miktar = Math.floor(Math.random() * 200) + 100;
      await kullaniciyiGuncelle(message.guild.id, message.author.id, { sonGunluk: simdi });
      await paraEkle(message.guild.id, message.author.id, miktar);
      message.reply(`💰 Günlük ödülünü aldın: **+${miktar} coin**!`);
    } catch (e) { hata(message, "E4002"); }
    return;
  }

  if (cmd === "cal") {
    const hedef = message.mentions.members?.first();
    if (!hedef || hedef.id === message.author.id) return hata(message, "E1003", "`!cal @kullanıcı`");
    try {
      const hedefData = await kullaniciyiGetir(message.guild.id, hedef.id);
      if ((hedefData.para || 0) <= 0) return message.reply("❌ Hedefin parası yok.");
      const basari = Math.random() < 0.4;
      if (basari) {
        const miktar = Math.floor(Math.random() * Math.min(hedefData.para, 200)) + 1;
        await paraEkle(message.guild.id, hedef.id, -miktar);
        await paraEkle(message.guild.id, message.author.id, miktar);
        message.reply(`🦹 **${hedef.user.username}** kullanıcısından **${miktar} coin** çaldın!`);
      } else {
        const ceza = Math.floor(Math.random() * 100) + 50;
        await paraEkle(message.guild.id, message.author.id, -ceza);
        message.reply(`🚔 Çalma girişimi başarısız! **${ceza} coin** ceza ödedin.`);
      }
    } catch (e) { hata(message, "E4002"); }
    return;
  }

  if (cmd === "market") {
    const embed = new EmbedBuilder()
      .setTitle("🛍️ Market")
      .setColor(Colors.Gold)
      .setDescription(MARKET.map(u => `**${u.id}.** ${u.isim} — **${u.fiyat} coin**\n> ${u.aciklama}`).join("\n\n"))
      .setFooter({ text: "!satinal <id> ile satın alabilirsin" })
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "satinal") {
    const urunId = parseInt(args[0]);
    const urun = MARKET.find(u => u.id === urunId);
    if (!urun) return hata(message, "E6004");
    try {
      const userData = await kullaniciyiGetir(message.guild.id, message.author.id);
      if ((userData.para || 0) < urun.fiyat) return hata(message, "E6001");
      await paraEkle(message.guild.id, message.author.id, -urun.fiyat);
      const envanter = [...(userData.envanter || []), { ...urun, satin: new Date() }];
      await kullaniciyiGuncelle(message.guild.id, message.author.id, { envanter });

      // Sürpriz kutu özel efekti
      if (urun.id === 5) {
        const bonus = Math.floor(Math.random() * 451) + 50;
        await paraEkle(message.guild.id, message.author.id, bonus);
        message.reply(`🎁 Sürpriz kutu açıldı! **+${bonus} coin** kazandın!`);
      } else {
        message.reply(`✅ **${urun.isim}** satın alındı! **-${urun.fiyat} coin**`);
      }
    } catch (e) { hata(message, "E4002"); }
    return;
  }

  if (cmd === "envanter") {
    const hedef = message.mentions.members?.first() || message.member;
    try {
      const userData = await kullaniciyiGetir(message.guild.id, hedef.id);
      const envanter = userData.envanter || [];
      if (!envanter.length) return message.reply(`📦 **${hedef.user.username}** envanteri boş.`);
      const embed = new EmbedBuilder()
        .setTitle(`📦 ${hedef.user.username} Envanteri`)
        .setColor(Colors.Orange)
        .setDescription(envanter.map(u => `${u.isim} — ${u.aciklama}`).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (e) { hata(message, "E4003"); }
    return;
  }

  if (cmd === "kumar") {
    const miktar = parseInt(args[0]);
    if (!miktar || miktar < 1) return hata(message, "E6002");
    try {
      const userData = await kullaniciyiGetir(message.guild.id, message.author.id);
      if ((userData.para || 0) < miktar) return hata(message, "E6001");
      const kazandi = Math.random() < 0.45;
      await paraEkle(message.guild.id, message.author.id, kazandi ? miktar : -miktar);
      message.reply(kazandi
        ? `🎰 **Kazandın!** +**${miktar} coin** 🎉`
        : `🎰 **Kaybettin!** -**${miktar} coin** 😢`
      );
    } catch (e) { hata(message, "E4002"); }
    return;
  }

  if (cmd === "piyango") {
    const miktar = parseInt(args[0]);
    if (!miktar || miktar < 10) return message.reply("❌ En az 10 coin girmelisin.");
    try {
      const userData = await kullaniciyiGetir(message.guild.id, message.author.id);
      if ((userData.para || 0) < miktar) return hata(message, "E6001");
      await paraEkle(message.guild.id, message.author.id, -miktar);
      const sayi = Math.random();
      let sonuc, kazanc;
      if (sayi < 0.01) { kazanc = miktar * 10; sonuc = `🎊 JACKPOT! x10 → **+${kazanc} coin**`; }
      else if (sayi < 0.1) { kazanc = miktar * 3; sonuc = `🎉 Büyük ödül! x3 → **+${kazanc} coin**`; }
      else if (sayi < 0.3) { kazanc = miktar; sonuc = `✅ Para geri → **+${kazanc} coin**`; }
      else { kazanc = 0; sonuc = `❌ Kaybettin!`; }
      if (kazanc > 0) await paraEkle(message.guild.id, message.author.id, kazanc);
      message.reply(`🎟️ Piyango sonucu: ${sonuc}`);
    } catch (e) { hata(message, "E4002"); }
    return;
  }

  if (cmd === "transfer") {
    const hedef = message.mentions.members?.first();
    const miktar = parseInt(args[1]);
    if (!hedef) return hata(message, "E1003", "`!transfer @kullanıcı <miktar>`");
    if (!miktar || miktar < 1) return hata(message, "E6002");
    if (hedef.id === message.author.id) return message.reply("❌ Kendine transfer yapamazsın.");
    try {
      const userData = await kullaniciyiGetir(message.guild.id, message.author.id);
      if ((userData.para || 0) < miktar) return hata(message, "E6001");
      await paraEkle(message.guild.id, message.author.id, -miktar);
      await paraEkle(message.guild.id, hedef.id, miktar);
      message.reply(`💸 **${hedef.user.username}**'e **${miktar} coin** transfer edildi.`);
    } catch (e) { hata(message, "E4002"); }
    return;
  }

  // ════════════════════════════════════════════
  //  SEVİYE KOMUTLARI
  // ════════════════════════════════════════════

  if (cmd === "seviye") {
    const hedef = message.mentions.members?.first() || message.member;
    try {
      const userData = await kullaniciyiGetir(message.guild.id, hedef.id);
      const seviye = userData.seviye || 1;
      const xp = userData.xp || 0;
      const sonrakiXp = Math.pow((seviye + 1) / 0.1, 2);
      const embed = new EmbedBuilder()
        .setTitle(`📈 ${hedef.user.username} Seviyesi`)
        .setColor(Colors.Green)
        .addFields(
          { name: "🏆 Seviye", value: `${seviye}`, inline: true },
          { name: "⭐ XP",     value: `${xp}`, inline: true },
          { name: "🎯 Sonraki Seviye", value: `${Math.floor(sonrakiXp)} XP`, inline: true },
        ).setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (e) { hata(message, "E4003"); }
    return;
  }

  if (cmd === "liderlik") {
    try {
      const top = await db.collection("kullanicilar")
        .find({ guildId: message.guild.id })
        .sort({ xp: -1 })
        .limit(10)
        .toArray();
      if (!top.length) return message.reply("📭 Henüz veri yok.");
      const embed = new EmbedBuilder()
        .setTitle("🏆 XP Liderlik Tablosu")
        .setColor(Colors.Gold)
        .setDescription(top.map((u, i) => `**${i + 1}.** <@${u.userId}> — Seviye **${u.seviye || 1}** (${u.xp || 0} XP)`).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (e) { hata(message, "E4003"); }
    return;
  }

  if (cmd === "xp") {
    const hedef = message.mentions.members?.first() || message.member;
    try {
      const userData = await kullaniciyiGetir(message.guild.id, hedef.id);
      message.reply(`⭐ **${hedef.user.username}** — ${userData.xp || 0} XP | Seviye **${userData.seviye || 1}**`);
    } catch (e) { hata(message, "E4003"); }
    return;
  }

  // ════════════════════════════════════════════
  //  YAPAY ZEKA KOMUTLARI
  // ════════════════════════════════════════════

  if (cmd === "ai" || cmd === "soru") {
    if (!args.length) return hata(message, "E1004", "`!ai <soru>`");
    const soru = args.join(" ");
    const bekle = await message.reply("🤖 Düşünüyorum...");
    try {
      const cevap = await geminiSor(soru);
      const embed = new EmbedBuilder()
        .setTitle("🤖 AIRBOT AI")
        .addFields({ name: "❓ Soru", value: soru }, { name: "💬 Cevap", value: cevap.slice(0, 1024) })
        .setColor(Colors.Gold)
        .setFooter({ text: "Gemini AI" })
        .setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch (e) {
      console.error("[E3001]", e.message);
      bekle.edit(HATALAR[e.message?.includes("API key") ? "E3002" : "E3001"]);
    }
    return;
  }

  if (cmd === "sohbet") {
    if (!args.length) return hata(message, "E1004", "`!sohbet <mesaj>`");
    const mesaj = args.join(" ");
    const bekle = await message.reply("💬 Yazıyor...");
    try {
      const cevap = await geminiSor(`Bir Jubbio sohbet botusun. Kısaca, samimi ve Türkçe cevap ver: ${mesaj}`);
      bekle.edit(cevap.slice(0, 2000));
    } catch (e) { bekle.edit(HATALAR.E3001); }
    return;
  }

  if (cmd === "yorumla") {
    if (!args.length) return hata(message, "E1004", "`!yorumla <metin>`");
    const metin = args.join(" ");
    const bekle = await message.reply("🔍 Yorumlanıyor...");
    try {
      const cevap = await geminiSor(`Aşağıdaki metni kısaca yorumla ve analiz et (Türkçe): "${metin}"`);
      const embed = new EmbedBuilder().setTitle("🔍 Yorum").addFields({ name: "📝 Metin", value: metin }, { name: "💡 Yorum", value: cevap.slice(0, 1024) }).setColor(Colors.Purple).setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch (e) { bekle.edit(HATALAR.E3001); }
    return;
  }

  if (cmd === "ozetle") {
    if (!args.length) return hata(message, "E1004", "`!ozetle <metin>`");
    const metin = args.join(" ");
    const bekle = await message.reply("📄 Özetleniyor...");
    try {
      const cevap = await geminiSor(`Aşağıdaki metni kısaca özetle (Türkçe, 3-4 cümle): "${metin}"`);
      const embed = new EmbedBuilder().setTitle("📄 Özet").addFields({ name: "📝 Metin", value: metin.slice(0, 500) }, { name: "💡 Özet", value: cevap.slice(0, 1024) }).setColor(Colors.Blue).setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch (e) { bekle.edit(HATALAR.E3001); }
    return;
  }

  if (cmd === "cevir") {
    if (args.length < 2) return hata(message, "E1004", "`!cevir <dil> <metin>`");
    const dil = args[0];
    const metin = args.slice(1).join(" ");
    const bekle = await message.reply("🌐 Çevriliyor...");
    try {
      const cevap = await geminiSor(`"${metin}" metnini ${dil} diline çevir. Sadece çeviriyi yaz, açıklama yapma.`);
      const embed = new EmbedBuilder().setTitle("🌐 Çeviri").addFields({ name: "📝 Orijinal", value: metin }, { name: `🗣️ ${dil}`, value: cevap.slice(0, 1024) }).setColor(Colors.Aqua).setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch (e) { bekle.edit(HATALAR.E3001); }
    return;
  }

  // ════════════════════════════════════════════
  //  BOT AYARLARI
  // ════════════════════════════════════════════

  if (cmd === "logkanal") {
    if (!message.member?.permissions?.has("Administrator")) return hata(message, "E2007");
    const kanal = message.mentions.channels?.first();
    if (!kanal) return hata(message, "E1004", "`!logkanal <#kanal>`");
    logKanallar.set(message.guild.id, kanal.id);
    message.reply(`✅ Log kanalı **#${kanal.name}** olarak ayarlandı.`);
    return;
  }

  if (cmd === "kufurlistesi") {
    if (!message.member?.permissions?.has("ManageMessages")) return hata(message, "E2004");
    const kelime = args[0];
    if (!kelime) return message.reply("📋 Kullanım: `!kufurlistesi <kelime>` — kelime ekler/kaldırır");
    if (!kufurListesi.has(message.guild.id)) kufurListesi.set(message.guild.id, new Set());
    const liste = kufurListesi.get(message.guild.id);
    if (liste.has(kelime.toLowerCase())) {
      liste.delete(kelime.toLowerCase());
      message.reply(`✅ **${kelime}** küfür listesinden kaldırıldı.`);
    } else {
      liste.add(kelime.toLowerCase());
      message.reply(`✅ **${kelime}** küfür listesine eklendi.`);
    }
    return;
  }
});

// ─── Slash Komutları (/ prefix - Müzik) ──────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  const { commandName } = interaction;

  if (commandName === "sesligel") {
    const voiceChannelId = interaction.member?.voice?.channelId;
    if (!voiceChannelId) return interaction.reply({ content: HATALAR.E5001, ephemeral: true });
    try {
      const connection = joinVoiceChannel({ channelId: voiceChannelId, guildId: interaction.guildId, adapterCreator: client.voice.adapters.get(interaction.guildId) });
      connection.subscribe(getPlayer(interaction.guildId));
      interaction.reply("✅ Ses kanalına girildi!");
    } catch (e) { console.error("[E5005]", e.message); interaction.reply({ content: HATALAR.E5005, ephemeral: true }); }
    return;
  }

  if (commandName === "sesliçık") {
    const connection = getVoiceConnection(interaction.guildId);
    if (!connection) return interaction.reply({ content: HATALAR.E5003, ephemeral: true });
    connection.destroy();
    queues.delete(interaction.guildId);
    players.delete(interaction.guildId);
    interaction.reply("👋 Ses kanalından çıkıldı.");
    return;
  }

  if (commandName === "çal" || commandName === "oynat") {
    const sorgu = interaction.options.getString("şarkı", true);
    const voiceChannelId = interaction.member?.voice?.channelId;
    if (!voiceChannelId) return interaction.reply({ content: HATALAR.E5001, ephemeral: true });
    await interaction.deferReply();
    try {
      let connection = getVoiceConnection(interaction.guildId);
      if (!connection) {
        connection = joinVoiceChannel({ channelId: voiceChannelId, guildId: interaction.guildId, adapterCreator: client.voice.adapters.get(interaction.guildId) });
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
    } catch (e) { console.error("[E5005]", e.message); interaction.editReply(HATALAR.E5005); }
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

  if (commandName === "geç") {
    const queue = getQueue(interaction.guildId);
    if (!queue.playing || !queue.songs.length) return interaction.reply({ content: HATALAR.E5006, ephemeral: true });
    getPlayer(interaction.guildId).stop();
    interaction.reply("⏭️ Şarkı atlandı!");
    return;
  }

  if (commandName === "geri") {
    interaction.reply("⏮️ Önceki şarkıya dönme özelliği yakında gelecek!");
    return;
  }

  if (commandName === "sıra") {
    const queue = getQueue(interaction.guildId);
    if (!queue.songs.length) return interaction.reply({ content: "📭 Kuyruk boş.", ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle("🎶 Müzik Kuyruğu")
      .setDescription(queue.songs.map((s, i) => `${i === 0 ? "▶️" : `${i}.`} **${s.title}** — <@${s.requestedBy}>`).join("\n"))
      .setColor(Colors.Blue).setTimestamp();
    interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === "öneri") {
    const tur = interaction.options.getString("müzik türü") || "pop";
    const bekle = await interaction.reply({ content: `🎵 **${tur}** türünde müzik önerileri getiriliyor...`, fetchReply: true });
    try {
      const cevap = await geminiSor(`${tur} türünde 5 adet Türkçe şarkı öner. Sadece liste halinde yaz: Sanatçı - Şarkı adı`);
      const embed = new EmbedBuilder().setTitle(`🎵 ${tur} Önerileri`).setDescription(cevap.slice(0, 1024)).setColor(Colors.Purple).setTimestamp();
      interaction.editReply({ content: "", embeds: [embed] });
    } catch (e) { interaction.editReply(HATALAR.E3001); }
    return;
  }
});

// ─── Global Hata Yönetimi ─────────────────────────────────────────
client.on("error", (err) => console.error("[CLIENT]", err.message));
process.on("unhandledRejection", (err) => console.error("[UnhandledRejection]", err));
process.on("uncaughtException",  (err) => console.error("[UncaughtException]",  err));

// ─── Başlat ───────────────────────────────────────────────────────
console.log("🤖 AIRBOT başlatılıyor...");
client.login(TOKEN);
