// Tipos e constantes para storage backends

export const PROVIDER_TYPES = {
    GDRIVE: "gdrive",
    DROPBOX: "dropbox",
    ONEDRIVE: "onedrive",
    TELEGRAM: "telegram",
    SMB: "smb",
    SFTP: "sftp",
};

export const PROVIDER_STATUS = {
    NOT_CONFIGURED: "not_configured",
    CONNECTED: "connected",
    ERROR: "error",
    UNAVAILABLE: "unavailable",
};

export const PROVIDERS = [
    {
        id: "gdrive",
        name: "Google Drive",
        icon: "🟢",
        type: "oauth",
        description: "Sincroniza automaticamente com a tua conta Google",
    },
    {
        id: "dropbox",
        name: "Dropbox",
        icon: "🔵",
        type: "oauth",
        description: "Guarda na tua pasta Dropbox",
    },
    {
        id: "onedrive",
        name: "OneDrive",
        icon: "☁️",
        type: "oauth",
        description: "Integração com Microsoft OneDrive",
    },
    {
        id: "telegram",
        name: "Telegram",
        icon: "✈️",
        type: "direct",
        description: "Envia para um bot do Telegram",
    },
    {
        id: "smb",
        name: "Partilha de Rede (SMB)",
        icon: "🗂️",
        type: "direct",
        description: "Conecta a uma unidade de rede SMB/Windows",
    },
    {
        id: "sftp",
        name: "SFTP",
        icon: "🔒",
        type: "direct",
        description: "Conecta a um servidor SFTP",
    },
];

export const LOCAL_PROVIDER = {
    id: "local",
    name: "Armazenamento Local",
    icon: "💾",
    type: "local",
    status: "connected",
    description: "Pasta de Downloads no teu computador",
};
