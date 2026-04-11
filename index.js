// ╔══════════════════════════════════════════════════════════════════╗
// ║                    AIRBOT - Jubbio Bot v2.0                     ║
// ║  Yönetici | Oyun | Genel | Ekonomi | Seviye | Müzik | AI       ║
// ╚══════════════════════════════════════════════════════════════════╝

const { Client, GatewayIntentBits, EmbedBuilder, Colors, SlashCommandBuilder } = require("@jubbio/core");
const {
  joinVoiceChannel, createAudioPlayer, createAudioResourceFromUrl,
  probeAudioInfo, getVoiceConnection, AudioPlayerStatus, VoiceConnectionStatus,
} = require("@jubbio/voice");
const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");
const http = require("http");
// yt-dlp path'lerini tümünü dene
const possiblePaths = [
  "/opt/render/.local/bin",
  "/usr/local/bin",
  "/usr/bin",
  `${process.env.HOME}/.local/bin`,
];
process.env.PATH = possiblePaths.join(":") + ":" + process.env.PATH;
console.log(`🎵 PATH güncellendi: ${process.env.PATH.split(":").slice(0,5).join(":")}`);

// ─── Ortam Değişkenleri ───────────────────────────────────────────
const TOKEN       = process.env.BOT_TOKEN;
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const MONGO_URL   = process.env.MONGO_URL;
const WEATHER_KEY = process.env.WEATHER_API_KEY;

// ─── HTTP Sunucu (Port 10000) ─────────────────────────────────────
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online", bot: "AIRBOT", platform: "Jubbio" }));
}).listen(10000, () => console.log("🌐 HTTP sunucu port 10000'de çalışıyor."));

// ─── Hata Kodları ─────────────────────────────────────────────────
const E = {
  E1001: "❌ `[E1001]` Yanlış kullanım! Kullanım: ",
  E1002: "❌ `[E1002]` Geçersiz sayı değeri.",
  E1003: "❌ `[E1003]` Kullanıcı belirtilmedi. Kullanım: ",
  E1004: "❌ `[E1004]` Argüman eksik. Kullanım: ",
  E1005: "❌ `[E1005]` Bu komut sadece sunucularda kullanılabilir.",
  E2001: "🚫 `[E2001]` **Ban Üyeleri** yetkisi gerekli.",
  E2002: "🚫 `[E2002]` **Üye At** yetkisi gerekli.",
  E2003: "🚫 `[E2003]` **Üye Sustur** yetkisi gerekli.",
  E2004: "🚫 `[E2004]` **Mesajları Yönet** yetkisi gerekli.",
  E2005: "🚫 `[E2005]` **Kanalları Yönet** yetkisi gerekli.",
  E2006: "🚫 `[E2006]` Hedef kullanıcı daha yüksek role sahip.",
  E2007: "🚫 `[E2007]` **Yönetici** yetkisi gerekli.",
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
  E6003: "💰 `[E6003]` Günlük ödülünü zaten aldın.",
  E6004: "💰 `[E6004]` Ürün bulunamadı.",
};

function hata(ctx, kod, ek = "") {
  const kim = ctx.author?.username || ctx.user?.username || "?";
  const msg = E[kod] + ek;
  console.error(`[${kod}] ${kim}: ${msg}`);
  if (ctx.reply) return ctx.reply(msg);
  if (ctx.editReply) return ctx.editReply(msg);
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
async function dbKullanici(guildId, userId) {
  if (!db) throw new Error("E4001");
  const col = db.collection("kullanicilar");
  let u = await col.findOne({ guildId, userId });
  if (!u) {
    u = { guildId, userId, para: 0, xp: 0, seviye: 1, envanter: [], uyarilar: [], afk: null, notlar: [], sonGunluk: null };
    await col.insertOne(u);
  }
  return u;
}

async function dbGuncelle(guildId, userId, set) {
  if (!db) throw new Error("E4001");
  await db.collection("kullanicilar").updateOne({ guildId, userId }, { $set: set }, { upsert: true });
}

async function dbParaEkle(guildId, userId, miktar) {
  if (!db) throw new Error("E4001");
  await db.collection("kullanicilar").updateOne({ guildId, userId }, { $inc: { para: miktar } }, { upsert: true });
}

async function dbXpEkle(guildId, userId, miktar) {
  const u = await dbKullanici(guildId, userId);
  const yeniXp = (u.xp || 0) + miktar;
  const yeniSeviye = Math.floor(0.1 * Math.sqrt(yeniXp));
  const atladi = yeniSeviye > (u.seviye || 1);
  await db.collection("kullanicilar").updateOne({ guildId, userId }, { $set: { xp: yeniXp, seviye: yeniSeviye } }, { upsert: true });
  return { atladi, yeniSeviye };
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
  gatewayUrl: "wss://realtime.jubbio.com/ws/bot",
  apiUrl: "https://gateway.jubbio.com/api/v1",
});

// ─── Slash Komutları Tanımları ────────────────────────────────────
const SLASH_KOMUTLAR = [
  new SlashCommandBuilder()
    .setName("sesligel")
    .setDescription("Botu ses kanalına çeker.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("sesliçık")
    .setDescription("Botu ses kanalından çıkarır.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("çal")
    .setDescription("Şarkı çalar veya kuyruğa ekler.")
    .addStringOption(o => o.setName("şarkı").setDescription("Şarkı adı veya URL").setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName("oynat")
    .setDescription("Şarkı çalar veya kuyruğa ekler.")
    .addStringOption(o => o.setName("şarkı").setDescription("Şarkı adı veya URL").setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName("dur")
    .setDescription("Müziği durdurur, kuyruğu temizler ve kanaldan çıkar.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("geç")
    .setDescription("Mevcut şarkıyı atlayıp sıradakini çalar.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("geri")
    .setDescription("Önceki şarkıya döner.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("sıra")
    .setDescription("Müzik kuyruğunu gösterir.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("öneri")
    .setDescription("Müzik türüne göre şarkı önerir.")
    .addStringOption(o => o.setName("tür").setDescription("Müzik türü (pop, rock, rap, türkçe...)").setRequired(true))
    .toJSON(),
];

// ─── Slash Komutlarını Kaydet ─────────────────────────────────────
async function slashKomutlariKaydet() {
  console.log("📝 Slash komutları kaydediliyor...");

  const appId = client.applicationId;
  if (!appId) {
    console.error("❌ applicationId bulunamadı!");
    return;
  }

  console.log(`🔍 Application ID: ${appId}`);

  // Yöntem 1: client.rest.registerGlobalCommands
  try {
    await client.rest.registerGlobalCommands(SLASH_KOMUTLAR);
    console.log(`✅ ${SLASH_KOMUTLAR.length} komut registerGlobalCommands ile kaydedildi.`);
    SLASH_KOMUTLAR.forEach(k => console.log(`  ✅ /${k.name}`));
    return;
  } catch (e) {
    console.error("❌ registerGlobalCommands başarısız:", e.message);
  }

  // Yöntem 2: Direkt REST isteği (gateway.jubbio.com/api/v1/applications/{appId}/commands)
  console.log("🔄 Direkt REST ile deneniyor...");
  try {
    for (const komut of SLASH_KOMUTLAR) {
      const res = await fetch(`https://gateway.jubbio.com/api/v1/applications/${appId}/commands`, {
        method: "POST",
        headers: {
          "Authorization": `Bot ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(komut),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`  ✅ /${komut.name} kaydedildi.`);
      } else {
        console.error(`  ❌ /${komut.name}: ${JSON.stringify(data)}`);
      }
    }
  } catch (e) {
    console.error("❌ Direkt REST başarısız:", e.message);
  }
}

// ─── Müzik ───────────────────────────────────────────────────────
const queues   = new Map(); // guildId -> Song[]
const players  = new Map(); // guildId -> AudioPlayer
const channels = new Map(); // guildId -> TextChannel (şarkı mesajları için)

function getPlayer(guildId) {
  if (players.has(guildId)) return players.get(guildId);

  const player = createAudioPlayer();
  players.set(guildId, player);

  // Resmi örnekteki gibi stateChange ile Idle dinle
  player.on("stateChange", (oldState, newState) => {
    if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
      const queue = queues.get(guildId) || [];
      queue.shift();
      queues.set(guildId, queue);
      playNext(guildId);
    }
  });

  player.on("error", (err) => {
    console.error(`[E5004] Guild ${guildId}: ${err.message}`);
    const ch = channels.get(guildId);
    if (ch) ch.send(E.E5004);
    const queue = queues.get(guildId) || [];
    queue.shift();
    queues.set(guildId, queue);
    playNext(guildId);
  });

  return player;
}

async function playNext(guildId) {
  const queue = queues.get(guildId) || [];
  const ch = channels.get(guildId);

  if (queue.length === 0) {
    console.log(`[Müzik] Guild ${guildId} kuyruğu bitti.`);
    return;
  }

  const song = queue[0];
  console.log(`[Müzik] Çalıyor: ${song.title}`);

  try {
    const resource = createAudioResourceFromUrl(song.url, { metadata: song });
    const player = getPlayer(guildId);
    player.play(resource);

    if (ch) {
      const embed = new EmbedBuilder()
        .setTitle("🎵 Şimdi Çalıyor")
        .setDescription(`**${song.title}**`)
        .setColor(Colors.Blue)
        .addFields({ name: "İsteyen", value: `<@${song.requestedBy}>`, inline: true })
        .setTimestamp();
      ch.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error(`[E5004] ${err.message}`);
    if (ch) ch.send(E.E5004);
    queue.shift();
    queues.set(guildId, queue);
    playNext(guildId);
  }
}

// ─── API Yardımcıları ─────────────────────────────────────────────
async function geminiSor(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
  );
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

// ─── Sabit Veriler ────────────────────────────────────────────────
const SORULAR = [
  { soru: "Türkiye'nin başkenti neresidir?", cevap: "ankara" },
  { soru: "En büyük okyanus hangisidir?", cevap: "büyük okyanus" },
  { soru: "Su'nun kimyasal formülü nedir?", cevap: "h2o" },
  { soru: "Güneş sisteminin en büyük gezegeni?", cevap: "jüpiter" },
  { soru: "Türkiye kaç ilden oluşur?", cevap: "81" },
  { soru: "İstanbul'un eski adı nedir?", cevap: "konstantinopolis" },
  { soru: "Dünyanın en uzun nehri?", cevap: "nil" },
  { soru: "Türkiye Cumhuriyeti ne zaman kuruldu?", cevap: "1923" },
  { soru: "Işığın hızı yaklaşık kaç km/s?", cevap: "300000" },
  { soru: "Güneş sisteminde kaç gezegen var?", cevap: "8" },
  { soru: "Dünyanın en yüksek dağı?", cevap: "everest" },
  { soru: "İnsan vücudunda kaç kemik var?", cevap: "206" },
  { soru: "Türkiye'nin para birimi nedir?", cevap: "türk lirası" },
  { soru: "Osmanlı İmparatorluğu'nun kurucusu kimdir?", cevap: "osman bey" },
  { soru: "Türkiye'nin en uzun nehri?", cevap: "kızılırmak" },
];

const ESPRILER = [
  "Neden bilgisayarlar hiç üşümez? Çünkü Windows'ları var! 😄",
  "Programcı markete gider. Karısı der ki: '1 ekmek al, süt varsa 6 tane al.' Programcı 6 ekmek alır. 😅",
  "Bot olmanın güzel yanı: Asla yorulmam. Kötü yanı: Asla uyuyamam. 😴",
  "Neden Java programcıları gözlük takar? Çünkü C# göremezler! 👓",
  "İki integer yürüyor... Float geçiyor. Biri der ki: 'Bak şu noktasını kaybetmiş!' 😆",
  "Kendime ne mesleği seçeyim dedim, bot oldum. Pişman değilim. 🤖",
  "Sormak bedava değil mi? Evet ama cevap da öyle! 😂",
];

const MARKET = [
  { id: 1, isim: "🎭 VIP Rozet",    fiyat: 500,  aciklama: "Profilde özel VIP rozeti" },
  { id: 2, isim: "🎨 Renk Rolü",    fiyat: 300,  aciklama: "Özel renk rolü" },
  { id: 3, isim: "🔮 Şans Tılsımı", fiyat: 200,  aciklama: "Kumarda %10 bonus şans" },
  { id: 4, isim: "💎 XP Boost",     fiyat: 1000, aciklama: "24 saat 2x XP kazanımı" },
  { id: 5, isim: "🎁 Sürpriz Kutu", fiyat: 100,  aciklama: "50-500 arası rastgele para" },
];

// ─── Uçucu Veriler (Bellekte) ─────────────────────────────────────
const afklar      = new Map(); // userId -> { sebep, zaman }
const logKanallar = new Map(); // guildId -> channelId
const kufurler    = new Map(); // guildId -> Set<string>

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────
function sureyi_parse(sure) {
  const m = sure.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return null;
  return parseInt(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
}

async function logGonder(guild, mesaj) {
  const kanalId = logKanallar.get(guild.id);
  if (!kanalId) return;
  try {
    const kanal = guild.channels.cache.get(kanalId);
    if (kanal) kanal.send(`📋 **LOG** | ${new Date().toLocaleString("tr-TR")} | ${mesaj}`);
  } catch (e) { console.error("[LOG HATA]", e.message); }
}

// ─── Ready ────────────────────────────────────────────────────────
client.on("ready", async () => {
  console.log(`✅ ${client.user?.username} çevrimiçi!`);
  console.log(`📊 ${client.guilds.size} sunucuda aktif.`);
  console.log(`🆔 Application ID: ${client.applicationId}`);
  await slashKomutlariKaydet();
});

// ─── Debug: Her mesajı logla ─────────────────────────────────────
client.on("raw", (eventType, data) => {
  if (eventType === "MESSAGE_CREATE") {
    console.log(`[RAW] Mesaj alındı: ${JSON.stringify(data).slice(0, 100)}`);
  }
});

// ─── messageCreate ────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  // ── AFK kontrolü ───────────────────────────────────────────────
  if (afklar.has(message.author.id)) {
    afklar.delete(message.author.id);
    const m = await message.reply("👋 AFK modundan çıktın.");
    setTimeout(() => m.delete().catch(() => {}), 5000);
  }
  message.mentions.users.forEach(u => {
    if (afklar.has(u.id)) {
      const a = afklar.get(u.id);
      message.reply(`💤 **${u.username}** şu an AFK → ${a.sebep}`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }
  });

  // ── Küfür filtresi ─────────────────────────────────────────────
  const gKufur = kufurler.get(message.guild.id);
  if (gKufur) {
    const lower = message.content.toLowerCase();
    for (const k of gKufur) {
      if (lower.includes(k)) {
        message.delete().catch(() => {});
        message.channel.send(`⚠️ <@${message.author.id}>, uygunsuz kelime!`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        await logGonder(message.guild, `Küfür: ${message.author.username} → "${message.content}"`);
        break;
      }
    }
  }

  // ── XP kazan ───────────────────────────────────────────────────
  try {
    const { atladi, yeniSeviye } = await dbXpEkle(message.guild.id, message.author.id, Math.floor(Math.random() * 10) + 5);
    if (atladi) {
      message.channel.send(`🎉 Tebrikler <@${message.author.id}>! **${yeniSeviye}. seviyeye** ulaştın!`);
      await logGonder(message.guild, `Seviye: ${message.author.username} → Seviye ${yeniSeviye}`);
    }
  } catch { /* DB yoksa sessizce geç */ }

  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();

  // ══════════════════════════════════════════
  //  YARDIM & PING
  // ══════════════════════════════════════════

  if (cmd === "yardim" || cmd === "yardım") {
    const embed = new EmbedBuilder()
      .setTitle("📖 AIRBOT Komutları")
      .setColor(Colors.Purple)
      .addFields(
        { name: "👑 Yönetici (12)",  value: "`!temizle` `!temizle-kullanici` `!uyar` `!uyarilar` `!sustur` `!susturma-kaldir` `!ban` `!kick` `!banlist` `!duyuru` `!kilit` `!yavasmod`" },
        { name: "🎮 Oyun (6)",       value: "`!zar` `!yazitura` `!sayitahmin` `!bilgiyarisma` `!espri` `!8ball`" },
        { name: "📝 Genel (14)",     value: "`!ping` `!kullanici` `!sunucu` `!avatar` `!random` `!istatistik` `!afk` `!not` `!notlar` `!notsil` `!hatirlat` `!davet` `!destek` `!havadurumu`" },
        { name: "💰 Ekonomi (8)",    value: "`!gunluk` `!cal` `!market` `!satinal` `!envanter` `!kumar` `!piyango` `!transfer`" },
        { name: "📈 Seviye (3)",     value: "`!seviye` `!liderlik` `!xp`" },
        { name: "🎵 Sesli (9)",      value: "`/sesligel` `/sesliçık` `/çal` `/oynat` `/dur` `/geç` `/geri` `/sıra` `/öneri`" },
        { name: "🤖 AI (6)",         value: "`!ai` `!sohbet` `!yorumla` `!ozetle` `!cevir` `!soru`" },
        { name: "⚙️ Ayarlar (2)",    value: "`!logkanal` `!kufurlistesi`" },
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

  // ══════════════════════════════════════════
  //  YÖNETİCİ KOMUTLARI
  // ══════════════════════════════════════════

  if (cmd === "temizle") {
    if (!message.member?.permissions?.has("ManageMessages")) return hata(message, "E2004");
    const sayi = parseInt(args[0]) || 10;
    if (isNaN(sayi) || sayi < 1 || sayi > 100) return hata(message, "E1002");
    try {
      await message.channel.bulkDelete(sayi);
      const b = await message.channel.send(`🗑️ ${sayi} mesaj silindi.`);
      setTimeout(() => b.delete().catch(() => {}), 3000);
      await logGonder(message.guild, `Temizle: ${message.author.username} → ${sayi} mesaj`);
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
      const filtered = [...msgs.filter(m => m.author.id === user.id).values()].slice(0, sayi);
      await message.channel.bulkDelete(filtered);
      const b = await message.channel.send(`🗑️ **${user.user.username}** kullanıcısından ${filtered.length} mesaj silindi.`);
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
      const u = await dbKullanici(message.guild.id, user.id);
      const uyarilar = [...(u.uyarilar || []), { sebep, mod: message.author.id, tarih: new Date() }];
      await dbGuncelle(message.guild.id, user.id, { uyarilar });
      message.reply(`⚠️ **${user.user.username}** uyarıldı. Sebep: ${sebep} | Toplam: **${uyarilar.length}**`);
      await logGonder(message.guild, `Uyarı: ${user.user.username} → ${sebep} (Mod: ${message.author.username})`);
    } catch (e) { hata(message, E[e.message] ? e.message : "E4002"); }
    return;
  }

  if (cmd === "uyarilar") {
    const user = message.mentions.members?.first() || message.member;
    try {
      const u = await dbKullanici(message.guild.id, user.id);
      const uyarilar = u.uyarilar || [];
      if (!uyarilar.length) return message.reply(`✅ **${user.user.username}** uyarısı yok.`);
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ ${user.user.username} Uyarıları`)
        .setColor(Colors.Yellow)
        .setDescription(uyarilar.map((w, i) => `**${i + 1}.** ${w.sebep} — <t:${Math.floor(new Date(w.tarih).getTime() / 1000)}:R>`).join("\n"))
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
      await logGonder(message.guild, `Sustur: ${user.user.username} → ${dakika}dk`);
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
      await logGonder(message.guild, `Susturma kaldır: ${user.user.username}`);
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
      await logGonder(message.guild, `Ban: ${user.user.username} → ${reason}`);
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
      message.reply(`✅ **${user.user.username}** atıldı. Sebep: ${reason}`);
      await logGonder(message.guild, `Kick: ${user.user.username} → ${reason}`);
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
      if (!bans.size) return message.reply("✅ Ban listesi boş.");
      const embed = new EmbedBuilder()
        .setTitle(`🔨 Ban Listesi (${bans.size})`)
        .setColor(Colors.Red)
        .setDescription([...bans.values()].slice(0, 20).map(b => `**${b.user.username}** — ${b.reason || "Sebep yok"}`).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (e) { message.reply(`❌ Hata: ${e.message}`); }
    return;
  }

  if (cmd === "duyuru") {
    if (!message.member?.permissions?.has("Administrator")) return hata(message, "E2007");
    const duyuru = args.join(" ");
    if (!duyuru) return hata(message, "E1004", "`!duyuru <mesaj>`");
    message.delete().catch(() => {});
    const embed = new EmbedBuilder()
      .setTitle("📢 DUYURU")
      .setDescription(duyuru)
      .setColor(Colors.Red)
      .setFooter({ text: `Duyuran: ${message.author.username}` })
      .setTimestamp();
    message.channel.send({ embeds: [embed] });
    return;
  }

  if (cmd === "kilit") {
    if (!message.member?.permissions?.has("ManageChannels")) return hata(message, "E2005");
    try {
      const herkes = message.guild.roles.everyone;
      const mevcut = message.channel.permissionOverwrites.cache.get(herkes.id);
      const kilitli = mevcut?.deny?.has("SendMessages");
      await message.channel.permissionOverwrites.edit(herkes, { SendMessages: kilitli ? null : false });
      message.reply(kilitli ? "🔓 Kanal kilidi açıldı." : "🔒 Kanal kilitlendi.");
      await logGonder(message.guild, `Kilit: #${message.channel.name} → ${kilitli ? "açıldı" : "kilitlendi"}`);
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

  // ══════════════════════════════════════════
  //  OYUN KOMUTLARI
  // ══════════════════════════════════════════

  if (cmd === "zar") {
    const s = Math.floor(Math.random() * 6) + 1;
    return message.reply(`🎲 Zar: **${s}** ${["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣"][s - 1]}`);
  }

  if (cmd === "yazitura") {
    return message.reply(`🪙 **${Math.random() < 0.5 ? "Yazı ✍️" : "Tura 🪙"}**`);
  }

  if (cmd === "sayitahmin") {
    const sayi = Math.floor(Math.random() * 10) + 1;
    await message.reply("🔢 1-10 arası bir sayı düşündüm! 30 saniyede tahmin et.");
    try {
      const col = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id && !isNaN(m.content), max: 1, time: 30000, errors: ["time"] });
      const tahmin = parseInt(col.first().content);
      if (tahmin === sayi) {
        message.channel.send(`🎉 Doğru! Sayı **${sayi}** idi! +50 coin kazandın.`);
        await dbParaEkle(message.guild.id, message.author.id, 50);
      } else {
        message.channel.send(`❌ Yanlış! Sayı **${sayi}** idi.`);
      }
    } catch { message.channel.send(`⏰ Süre doldu! Sayı **${sayi}** idi.`); }
    return;
  }

  if (cmd === "bilgiyarisma") {
    const soru = SORULAR[Math.floor(Math.random() * SORULAR.length)];
    await message.reply(`❓ **${soru.soru}**\n⏰ 30 saniyede cevapla!`);
    try {
      const col = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id, max: 1, time: 30000, errors: ["time"] });
      if (col.first().content.toLowerCase().trim() === soru.cevap) {
        message.channel.send(`🎉 Doğru! **${soru.cevap.toUpperCase()}** +100 coin!`);
        await dbParaEkle(message.guild.id, message.author.id, 100);
      } else {
        message.channel.send(`❌ Yanlış! Cevap: **${soru.cevap.toUpperCase()}**`);
      }
    } catch { message.channel.send(`⏰ Süre doldu! Cevap: **${soru.cevap.toUpperCase()}**`); }
    return;
  }

  if (cmd === "espri") {
    return message.reply(ESPRILER[Math.floor(Math.random() * ESPRILER.length)]);
  }

  if (cmd === "8ball") {
    if (!args.length) return hata(message, "E1004", "`!8ball <soru>`");
    const c = ["Kesinlikle evet! ✅","Hayır. ❌","Belki... 🤔","Şüpheliyim 😐","Çok olası! 🎯","Asla! 🚫","Evet! 💯","Şu an söylemek zor 🌀","Olabilir 🙂","Sanmıyorum 😅"];
    return message.reply(`🎱 **${args.join(" ")}**\n> ${c[Math.floor(Math.random() * c.length)]}`);
  }

  // ══════════════════════════════════════════
  //  GENEL KOMUTLAR
  // ══════════════════════════════════════════

  if (cmd === "kullanici") {
    const h = message.mentions.members?.first() || message.member;
    const embed = new EmbedBuilder()
      .setTitle(`👤 ${h.user.username}`)
      .setColor(Colors.Blurple)
      .addFields(
        { name: "🆔 ID", value: h.id, inline: true },
        { name: "📅 Hesap Oluşturma", value: new Date(h.user.createdAt).toLocaleDateString("tr-TR"), inline: true },
        { name: "📥 Sunucuya Katılma", value: h.joinedAt ? new Date(h.joinedAt).toLocaleDateString("tr-TR") : "?", inline: true },
      ).setTimestamp();
    if (h.user.avatarURL) embed.setThumbnail(h.user.avatarURL());
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "sunucu") {
    if (!message.guild) return hata(message, "E1005");
    const g = message.guild;
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${g.name}`)
      .setColor(Colors.Green)
      .addFields(
        { name: "👥 Üye", value: `${g.memberCount}`, inline: true },
        { name: "🌐 ID",  value: g.id, inline: true },
        { name: "📅 Kurulma", value: new Date(g.createdAt).toLocaleDateString("tr-TR"), inline: true },
      ).setTimestamp();
    if (g.iconURL) embed.setThumbnail(g.iconURL());
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "avatar") {
    const h = message.mentions.members?.first() || message.member;
    const url = h.user.avatarURL ? h.user.avatarURL({ size: 512 }) : null;
    if (!url) return message.reply("❌ Avatar bulunamadı.");
    const embed = new EmbedBuilder().setTitle(`🖼️ ${h.user.username}`).setImage(url).setColor(Colors.Blurple);
    return message.reply({ embeds: [embed] });
  }

  if (cmd === "random") {
    const min = parseInt(args[0]) || 1;
    const max = parseInt(args[1]) || 100;
    if (min >= max) return hata(message, "E1002");
    return message.reply(`🎲 **${Math.floor(Math.random() * (max - min + 1)) + min}** (${min}-${max})`);
  }

  if (cmd === "istatistik") {
    try {
      const u = await dbKullanici(message.guild.id, message.author.id);
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${message.author.username}`)
        .setColor(Colors.Gold)
        .addFields(
          { name: "💰 Para",    value: `${u.para || 0} coin`, inline: true },
          { name: "📈 Seviye",  value: `${u.seviye || 1}`, inline: true },
          { name: "⭐ XP",      value: `${u.xp || 0}`, inline: true },
          { name: "⚠️ Uyarı",  value: `${(u.uyarilar || []).length}`, inline: true },
          { name: "📦 Envanter",value: `${(u.envanter || []).length} ürün`, inline: true },
        ).setTimestamp();
      message.reply({ embeds: [embed] });
    } catch { hata(message, "E4003"); }
    return;
  }

  if (cmd === "afk") {
    const sebep = args.join(" ") || "Sebep belirtilmedi";
    afklar.set(message.author.id, { sebep, zaman: new Date() });
    message.reply(`💤 AFK moduna geçildi. Sebep: **${sebep}**`);
    return;
  }

  if (cmd === "not") {
    const metin = args.join(" ");
    if (!metin) return hata(message, "E1004", "`!not <mesaj>`");
    try {
      const u = await dbKullanici(message.guild.id, message.author.id);
      const notlar = [...(u.notlar || []), { id: Date.now(), metin, tarih: new Date() }];
      await dbGuncelle(message.guild.id, message.author.id, { notlar });
      message.reply(`📝 Not kaydedildi! ID: \`${notlar[notlar.length - 1].id}\``);
    } catch { hata(message, "E4002"); }
    return;
  }

  if (cmd === "notlar") {
    try {
      const u = await dbKullanici(message.guild.id, message.author.id);
      const notlar = u.notlar || [];
      if (!notlar.length) return message.reply("📭 Hiç notun yok.");
      const embed = new EmbedBuilder()
        .setTitle("📝 Notların")
        .setColor(Colors.Yellow)
        .setDescription(notlar.map(n => `\`${n.id}\` — ${n.metin}`).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch { hata(message, "E4003"); }
    return;
  }

  if (cmd === "notsil") {
    const id = parseInt(args[0]);
    if (!id) return hata(message, "E1004", "`!notsil <id>`");
    try {
      const u = await dbKullanici(message.guild.id, message.author.id);
      const notlar = (u.notlar || []).filter(n => n.id !== id);
      await dbGuncelle(message.guild.id, message.author.id, { notlar });
      message.reply("✅ Not silindi.");
    } catch { hata(message, "E4004"); }
    return;
  }

  if (cmd === "hatirlat") {
    if (args.length < 2) return hata(message, "E1004", "`!hatirlat <süre: 30s/5m/2h/1d> <mesaj>`");
    const ms = sureyi_parse(args[0]);
    if (!ms) return message.reply("❌ Geçersiz süre. Örnek: `30s` `5m` `2h` `1d`");
    const metin = args.slice(1).join(" ");
    message.reply(`⏰ **${args[0]}** sonra hatırlatacağım: "${metin}"`);
    setTimeout(() => message.channel.send(`⏰ <@${message.author.id}> Hatırlatma: **${metin}**`), ms);
    return;
  }

  if (cmd === "davet") {
    return message.reply("📨 Bot davet linki: https://jubbio.com/bot/invite\n💬 Destek: https://jubbio.com/support");
  }

  if (cmd === "destek") {
    return message.reply("🆘 Destek: contact@jubbio.com\n💬 Sunucu: https://jubbio.com/support");
  }

  if (cmd === "havadurumu") {
    if (!args.length) return hata(message, "E1004", "`!havadurumu <şehir>`");
    const sehir = args.join(" ");
    const bekle = await message.reply(`🌤️ **${sehir}** hava durumu alınıyor...`);
    try {
      const data = await havaDurumuGetir(sehir);
      if (data.error) { console.error("[E3006]", data.error.message); return bekle.edit(E.E3006); }
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
      bekle.edit(E[e.message?.includes("timeout") ? "E3007" : "E3005"]);
    }
    return;
  }

  // ══════════════════════════════════════════
  //  EKONOMİ KOMUTLARI
  // ══════════════════════════════════════════

  if (cmd === "gunluk") {
    try {
      const u = await dbKullanici(message.guild.id, message.author.id);
      const son = u.sonGunluk ? new Date(u.sonGunluk) : null;
      const simdi = new Date();
      if (son && (simdi - son) < 86400000) {
        const kalan = 86400000 - (simdi - son);
        const s = Math.floor(kalan / 3600000), d = Math.floor((kalan % 3600000) / 60000);
        return message.reply(`⏰ Günlük ödülünü zaten aldın! Kalan: **${s}s ${d}d**`);
      }
      const miktar = Math.floor(Math.random() * 200) + 100;
      await dbGuncelle(message.guild.id, message.author.id, { sonGunluk: simdi });
      await dbParaEkle(message.guild.id, message.author.id, miktar);
      message.reply(`💰 Günlük ödül: **+${miktar} coin**! 🎉`);
    } catch { hata(message, "E4002"); }
    return;
  }

  if (cmd === "cal") {
    const hedef = message.mentions.members?.first();
    if (!hedef || hedef.id === message.author.id) return hata(message, "E1003", "`!cal @kullanıcı`");
    try {
      const hData = await dbKullanici(message.guild.id, hedef.id);
      if ((hData.para || 0) <= 0) return message.reply("❌ Hedefin parası yok.");
      if (Math.random() < 0.4) {
        const miktar = Math.floor(Math.random() * Math.min(hData.para, 200)) + 1;
        await dbParaEkle(message.guild.id, hedef.id, -miktar);
        await dbParaEkle(message.guild.id, message.author.id, miktar);
        message.reply(`🦹 **${hedef.user.username}**'den **${miktar} coin** çaldın!`);
      } else {
        const ceza = Math.floor(Math.random() * 100) + 50;
        await dbParaEkle(message.guild.id, message.author.id, -ceza);
        message.reply(`🚔 Yakalandın! **${ceza} coin** ceza ödedin.`);
      }
    } catch { hata(message, "E4002"); }
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
    const urun = MARKET.find(u => u.id === parseInt(args[0]));
    if (!urun) return hata(message, "E6004");
    try {
      const u = await dbKullanici(message.guild.id, message.author.id);
      if ((u.para || 0) < urun.fiyat) return hata(message, "E6001");
      await dbParaEkle(message.guild.id, message.author.id, -urun.fiyat);
      const envanter = [...(u.envanter || []), { ...urun, satin: new Date() }];
      await dbGuncelle(message.guild.id, message.author.id, { envanter });
      if (urun.id === 5) {
        const bonus = Math.floor(Math.random() * 451) + 50;
        await dbParaEkle(message.guild.id, message.author.id, bonus);
        message.reply(`🎁 Sürpriz kutu açıldı! **+${bonus} coin** kazandın!`);
      } else {
        message.reply(`✅ **${urun.isim}** satın alındı! **-${urun.fiyat} coin**`);
      }
    } catch { hata(message, "E4002"); }
    return;
  }

  if (cmd === "envanter") {
    const h = message.mentions.members?.first() || message.member;
    try {
      const u = await dbKullanici(message.guild.id, h.id);
      const env = u.envanter || [];
      if (!env.length) return message.reply(`📦 **${h.user.username}** envanteri boş.`);
      const embed = new EmbedBuilder()
        .setTitle(`📦 ${h.user.username} Envanteri`)
        .setColor(Colors.Orange)
        .setDescription(env.map(i => `${i.isim} — ${i.aciklama}`).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch { hata(message, "E4003"); }
    return;
  }

  if (cmd === "kumar") {
    const miktar = parseInt(args[0]);
    if (!miktar || miktar < 1) return hata(message, "E6002");
    try {
      const u = await dbKullanici(message.guild.id, message.author.id);
      if ((u.para || 0) < miktar) return hata(message, "E6001");
      const kazandi = Math.random() < 0.45;
      await dbParaEkle(message.guild.id, message.author.id, kazandi ? miktar : -miktar);
      message.reply(kazandi ? `🎰 **Kazandın!** +**${miktar} coin** 🎉` : `🎰 **Kaybettin!** -**${miktar} coin** 😢`);
    } catch { hata(message, "E4002"); }
    return;
  }

  if (cmd === "piyango") {
    const miktar = parseInt(args[0]);
    if (!miktar || miktar < 10) return message.reply("❌ En az 10 coin girmelisin.");
    try {
      const u = await dbKullanici(message.guild.id, message.author.id);
      if ((u.para || 0) < miktar) return hata(message, "E6001");
      await dbParaEkle(message.guild.id, message.author.id, -miktar);
      const r = Math.random();
      let mesaj, kazanc = 0;
      if (r < 0.01)      { kazanc = miktar * 10; mesaj = `🎊 JACKPOT! x10 → **+${kazanc} coin**`; }
      else if (r < 0.1)  { kazanc = miktar * 3;  mesaj = `🎉 Büyük ödül! x3 → **+${kazanc} coin**`; }
      else if (r < 0.3)  { kazanc = miktar;       mesaj = `✅ Para geri → **+${kazanc} coin**`; }
      else               {                         mesaj = "❌ Kaybettin!"; }
      if (kazanc > 0) await dbParaEkle(message.guild.id, message.author.id, kazanc);
      message.reply(`🎟️ Piyango: ${mesaj}`);
    } catch { hata(message, "E4002"); }
    return;
  }

  if (cmd === "transfer") {
    const hedef = message.mentions.members?.first();
    const miktar = parseInt(args[1]);
    if (!hedef) return hata(message, "E1003", "`!transfer @kullanıcı <miktar>`");
    if (!miktar || miktar < 1) return hata(message, "E6002");
    if (hedef.id === message.author.id) return message.reply("❌ Kendine transfer yapamazsın.");
    try {
      const u = await dbKullanici(message.guild.id, message.author.id);
      if ((u.para || 0) < miktar) return hata(message, "E6001");
      await dbParaEkle(message.guild.id, message.author.id, -miktar);
      await dbParaEkle(message.guild.id, hedef.id, miktar);
      message.reply(`💸 **${hedef.user.username}**'e **${miktar} coin** transfer edildi.`);
    } catch { hata(message, "E4002"); }
    return;
  }

  // ══════════════════════════════════════════
  //  SEVİYE KOMUTLARI
  // ══════════════════════════════════════════

  if (cmd === "seviye") {
    const h = message.mentions.members?.first() || message.member;
    try {
      const u = await dbKullanici(message.guild.id, h.id);
      const seviye = u.seviye || 1;
      const xp = u.xp || 0;
      const sonrakiXp = Math.floor(Math.pow((seviye + 1) / 0.1, 2));
      const embed = new EmbedBuilder()
        .setTitle(`📈 ${h.user.username}`)
        .setColor(Colors.Green)
        .addFields(
          { name: "🏆 Seviye",        value: `${seviye}`, inline: true },
          { name: "⭐ XP",             value: `${xp}`, inline: true },
          { name: "🎯 Sonraki Seviye", value: `${sonrakiXp} XP`, inline: true },
        ).setTimestamp();
      message.reply({ embeds: [embed] });
    } catch { hata(message, "E4003"); }
    return;
  }

  if (cmd === "liderlik") {
    try {
      if (!db) return hata(message, "E4001");
      const top = await db.collection("kullanicilar").find({ guildId: message.guild.id }).sort({ xp: -1 }).limit(10).toArray();
      if (!top.length) return message.reply("📭 Henüz veri yok.");
      const embed = new EmbedBuilder()
        .setTitle("🏆 XP Liderlik Tablosu")
        .setColor(Colors.Gold)
        .setDescription(top.map((u, i) => `**${i + 1}.** <@${u.userId}> — Seviye **${u.seviye || 1}** (${u.xp || 0} XP)`).join("\n"))
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch { hata(message, "E4003"); }
    return;
  }

  if (cmd === "xp") {
    const h = message.mentions.members?.first() || message.member;
    try {
      const u = await dbKullanici(message.guild.id, h.id);
      message.reply(`⭐ **${h.user.username}** — ${u.xp || 0} XP | Seviye **${u.seviye || 1}**`);
    } catch { hata(message, "E4003"); }
    return;
  }

  // ══════════════════════════════════════════
  //  YAPAY ZEKA KOMUTLARI
  // ══════════════════════════════════════════

  if (cmd === "ai" || cmd === "soru") {
    if (!args.length) return hata(message, "E1004", "`!ai <soru>`");
    const soru = args.join(" ");
    const bekle = await message.reply("🤖 Düşünüyorum...");
    try {
      const cevap = await geminiSor(soru);
      const embed = new EmbedBuilder()
        .setTitle("🤖 AIRBOT AI")
        .addFields({ name: "❓ Soru", value: soru }, { name: "💬 Cevap", value: cevap.slice(0, 1024) })
        .setColor(Colors.Gold).setFooter({ text: "Gemini AI" }).setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch (e) {
      console.error("[E3001]", e.message);
      bekle.edit(E[e.message?.includes("API key") ? "E3002" : "E3001"]);
    }
    return;
  }

  if (cmd === "sohbet") {
    if (!args.length) return hata(message, "E1004", "`!sohbet <mesaj>`");
    const bekle = await message.reply("💬 Yazıyor...");
    try {
      const cevap = await geminiSor(`Jubbio platformunda samimi bir sohbet botusun. Kısa, samimi, Türkçe cevap ver: ${args.join(" ")}`);
      bekle.edit(cevap.slice(0, 2000));
    } catch { bekle.edit(E.E3001); }
    return;
  }

  if (cmd === "yorumla") {
    if (!args.length) return hata(message, "E1004", "`!yorumla <metin>`");
    const metin = args.join(" ");
    const bekle = await message.reply("🔍 Yorumlanıyor...");
    try {
      const cevap = await geminiSor(`Şu metni kısaca Türkçe yorumla ve analiz et: "${metin}"`);
      const embed = new EmbedBuilder().setTitle("🔍 Yorum").addFields({ name: "📝 Metin", value: metin }, { name: "💡 Yorum", value: cevap.slice(0, 1024) }).setColor(Colors.Purple).setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch { bekle.edit(E.E3001); }
    return;
  }

  if (cmd === "ozetle") {
    if (!args.length) return hata(message, "E1004", "`!ozetle <metin>`");
    const metin = args.join(" ");
    const bekle = await message.reply("📄 Özetleniyor...");
    try {
      const cevap = await geminiSor(`Şu metni 3-4 cümleyle Türkçe özetle: "${metin}"`);
      const embed = new EmbedBuilder().setTitle("📄 Özet").addFields({ name: "📝 Metin", value: metin.slice(0, 500) }, { name: "💡 Özet", value: cevap.slice(0, 1024) }).setColor(Colors.Blue).setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch { bekle.edit(E.E3001); }
    return;
  }

  if (cmd === "cevir") {
    if (args.length < 2) return hata(message, "E1004", "`!cevir <dil> <metin>`");
    const dil = args[0];
    const metin = args.slice(1).join(" ");
    const bekle = await message.reply("🌐 Çevriliyor...");
    try {
      const cevap = await geminiSor(`"${metin}" metnini ${dil} diline çevir. Sadece çeviriyi yaz.`);
      const embed = new EmbedBuilder().setTitle("🌐 Çeviri").addFields({ name: "📝 Orijinal", value: metin }, { name: `🗣️ ${dil}`, value: cevap.slice(0, 1024) }).setColor(Colors.Aqua).setTimestamp();
      bekle.edit({ content: "", embeds: [embed] });
    } catch { bekle.edit(E.E3001); }
    return;
  }

  // ══════════════════════════════════════════
  //  BOT AYARLARI
  // ══════════════════════════════════════════

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
    if (!kelime) return message.reply("📋 `!kufurlistesi <kelime>` — ekler veya kaldırır");
    if (!kufurler.has(message.guild.id)) kufurler.set(message.guild.id, new Set());
    const liste = kufurler.get(message.guild.id);
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

// ─── Slash Komut Eventleri ────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  const { commandName } = interaction;

  // ── /sesligel ────────────────────────────────────────────────
  if (commandName === "sesligel") {
    const vcId = interaction.member?.voice?.channelId;
    if (!vcId) return interaction.reply({ content: E.E5001, ephemeral: true });
    try {
      let conn = getVoiceConnection(interaction.guildId);
      if (!conn || conn.state.status === VoiceConnectionStatus.Disconnected) {
        conn = joinVoiceChannel({
          channelId: vcId,
          guildId: interaction.guildId,
          adapterCreator: client.voice.adapters.get(interaction.guildId),
        });
        conn.subscribe(getPlayer(interaction.guildId));
      }
      channels.set(interaction.guildId, interaction.channel);
      interaction.reply("✅ Ses kanalına girildi!");
    } catch (e) { console.error("[E5005]", e.message); interaction.reply({ content: E.E5005, ephemeral: true }); }
    return;
  }

  // ── /sesliçık ────────────────────────────────────────────────
  if (commandName === "sesliçık") {
    const conn = getVoiceConnection(interaction.guildId);
    if (!conn) return interaction.reply({ content: E.E5003, ephemeral: true });
    conn.destroy();
    queues.delete(interaction.guildId);
    players.delete(interaction.guildId);
    interaction.reply("👋 Ses kanalından çıkıldı.");
    return;
  }

  // ── /çal ve /oynat ───────────────────────────────────────────
  if (commandName === "çal" || commandName === "oynat") {
    const sorgu = interaction.options.getString("şarkı", true);
    const vcId  = interaction.member?.voice?.channelId;
    if (!vcId) return interaction.reply({ content: E.E5001, ephemeral: true });
    await interaction.deferReply();
    try {
      // Ses kanalına bağlan
      let conn = getVoiceConnection(interaction.guildId);
      if (!conn || conn.state.status === VoiceConnectionStatus.Disconnected) {
        conn = joinVoiceChannel({
          channelId: vcId,
          guildId: interaction.guildId,
          adapterCreator: client.voice.adapters.get(interaction.guildId),
        });
        conn.subscribe(getPlayer(interaction.guildId));
      }

      // Metin kanalını kaydet (şarkı embed'leri için)
      channels.set(interaction.guildId, interaction.channel);

      // Şarkı bilgisini al
      const info = await probeAudioInfo(sorgu);
      const song = {
        url: sorgu,
        title: info.title || sorgu,
        duration: info.duration || 0,
        requestedBy: interaction.user.id,
      };

      // Kuyruğa ekle
      const queue = queues.get(interaction.guildId) || [];
      queue.push(song);
      queues.set(interaction.guildId, queue);

      // Çalmıyorsa başlat
      const player = getPlayer(interaction.guildId);
      if (player.state.status === AudioPlayerStatus.Idle) {
        playNext(interaction.guildId);
        await interaction.editReply(`▶️ Çalıyor: **${song.title}**`);
      } else {
        await interaction.editReply(`✅ Kuyruğa eklendi: **${song.title}** (Sıra: ${queue.length})`);
      }
    } catch (e) { console.error("[E5005]", e.message); interaction.editReply(`${E.E5005}
\`${e.message}\``); }
    return;
  }

  // ── /dur ─────────────────────────────────────────────────────
  if (commandName === "dur") {
    const player = getPlayer(interaction.guildId);
    if (player.state.status === AudioPlayerStatus.Idle) 
      return interaction.reply({ content: E.E5002, ephemeral: true });
    player.stop();
    queues.set(interaction.guildId, []);
    const conn = getVoiceConnection(interaction.guildId);
    conn?.disconnect();
    interaction.reply("⏹️ Müzik durduruldu ve kanaldan çıkıldı.");
    return;
  }

  // ── /geç ─────────────────────────────────────────────────────
  if (commandName === "geç") {
    const player = getPlayer(interaction.guildId);
    const queue = queues.get(interaction.guildId) || [];
    if (player.state.status === AudioPlayerStatus.Idle || !queue.length)
      return interaction.reply({ content: E.E5006, ephemeral: true });
    // stop() → stateChange Idle → playNext() otomatik tetiklenir
    player.stop();
    interaction.reply("⏭️ Şarkı atlandı!");
    return;
  }

  // ── /geri ────────────────────────────────────────────────────
  if (commandName === "geri") {
    interaction.reply("⏮️ Önceki şarkıya dönme özelliği yakında!");
    return;
  }

  // ── /sıra ────────────────────────────────────────────────────
  if (commandName === "sıra") {
    const queue = queues.get(interaction.guildId) || [];
    const player = getPlayer(interaction.guildId);
    if (!queue.length && player.state.status === AudioPlayerStatus.Idle)
      return interaction.reply({ content: "📭 Kuyruk boş.", ephemeral: true });
    const liste = queue.map((s, i) => `${i === 0 ? "▶️" : `${i}.`} **${s.title}** — <@${s.requestedBy}>`).join("\n");
    const embed = new EmbedBuilder()
      .setTitle(`🎶 Müzik Kuyruğu (${queue.length} şarkı)`)
      .setDescription(liste || "Kuyruk boş")
      .setColor(Colors.Blue).setTimestamp();
    interaction.reply({ embeds: [embed] });
    return;
  }

  // ── /öneri ───────────────────────────────────────────────────
  if (commandName === "öneri") {
    const tur = interaction.options.getString("tür") || "pop";
    await interaction.deferReply();
    try {
      const cevap = await geminiSor(`${tur} türünde 5 adet Türkçe şarkı öner. Sadece liste: Sanatçı - Şarkı adı`);
      const embed = new EmbedBuilder().setTitle(`🎵 ${tur} Önerileri`).setDescription(cevap.slice(0, 1024)).setColor(Colors.Purple).setTimestamp();
      interaction.editReply({ embeds: [embed] });
    } catch { interaction.editReply(E.E3001); }
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
