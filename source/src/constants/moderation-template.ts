export const DEFAULT_MODERATION_CONFIG = {
    topic: {
        status: false,
        topicsList: {},
        extra: null
    },
    autoDetection: {
        arabic: { name: "Caracteres arabes", status: true },
        oriental: { name: "Caracteres orientais", status: true },
        russian: { name: "Caracteres russos", status: true }
    },
    welcome: {
        status: true,
        message: "Ei, {{username}} você acaba de entrar no ônibus de batalha 🚌. \nEstamos nos aproximando da ilha, fale com o motorista no @BattleBusBot para entrar no esquadrão! \nNão se esqueça de ler as regras e entrar no canal de notícias. Qualquer dúvida chame os admins.",
        deleteLastMessage: true,
        image: { fileId: null, type: null }
    },
    warn: {
        count: 3
    },
    gifs: {
        status: false,
        time: 5,
        count: 3
    },
    permissions: {
        newMember: {
            can_send_messages: true,
            can_send_media_messages: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            can_invite_users: false
        },
        member: {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_invite_users: false
        },
        group: {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_invite_users: false
        },
        nightmode: {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            can_invite_users: false
        },
    },
    nightmode: {
        status: false,
        message: "Ei, {{user}} 🌙✨\nO ônibus de batalha já descansou por hoje 🚌💤. Entre {{start}} e {{end}} é hora de recarregar as energias para a próxima partida!\n\nNão se esqueça de conferir as regras e dar uma passada no canal de notícias antes de dormir. Qualquer dúvida, os admins estão por aqui.\n\nBoa noite, tryhard 🌌🔥. Que seus sonhos sejam tão épicos quanto uma vitória royale! 🏆💤\n\n{{button:👑Clubinho FNBR👑|https://t.me/CentralFortnite/49}} {{button:⚠️REGRAS⚠️|https://t.me/regrasfnbr}} {{button:🗞Notícias e Vazamentos❗️|https://t.me/brasilfortnite}}",
        time: { start: "00:30", end: "05:30" },
        image: { fileId: null, type: null },
        closeMessage: "🚌💤 O ônibus de batalha encerrou as atividades por hoje!\nA partir das {{start}}, o grupo entra em modo fechado para recarregar as energias antes da próxima partida.\n\n👑 Exceção: membros do Clubinho FNBR não precisam ir descansar com o ônibus e podem continuar ativos normalmente.\n\nSe quiser entrar para o Clubinho use o botão abaixo\n\n{{button:⚠️REGRAS⚠️|<a href=\"https://t.me/regrasfnbr\">https://t.me/regrasfnbr</a>}}\n {{button:🗞Notícias e Vazamentos❗️|<a href=\"https://t.me/brasilfortnite\">https://t.me/brasilfortnite</a>}}\n {{button:👥 Grupo principal❗️|<a href=\"https://t.me/fortnitebrasil\">https://t.me/fortnitebrasil</a>}}\n {{button:👑Clubinho FNBR👑|<a href=\"https://t.me/CentralFortnite/49\">https://t.me/CentralFortnite/49</a>}}"
    },
    buttons: [
        { text: "👑Clubinho FNBR👑", callback_data: "https://t.me/CentralFortnite/49" },
        { text: "⚠️REGRAS⚠️", callback_data: "https://t.me/regrasfnbr" },
        { text: "🗞Notícias e Vazamentos❗️", callback_data: "https://t.me/brasilfortnite" }
    ],
    rulesCheck: {
        status: false
    }
};