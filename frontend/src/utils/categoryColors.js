// Mapeamento de categoria → cor hex + label PT
const CATEGORY_COLORS = {
    acoustic: { hex: "#4ECDC4", label: "Acústico" },
    rock: { hex: "#FF6B6B", label: "Rock" },
    energetic: { hex: "#FF8E53", label: "Energético" },
    calm: { hex: "#95A5A6", label: "Calmo" },
    dance: { hex: "#A29BFE", label: "Dance" },
    instrumental: { hex: "#74B9FF", label: "Instrumental" },
    podcast_rap: { hex: "#FD79A8", label: "Rap/Podcast" },
    mixed: { hex: "#B2BEC3", label: "Misto" },
    unknown: { hex: "#DFE6E9", label: "?" },
};

export function getCategoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS.unknown;
}

export function getAllCategories() {
    return Object.keys(CATEGORY_COLORS);
}

export default CATEGORY_COLORS;
