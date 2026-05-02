const _cache = {};

export function extractDominantColor(imgUrl) {
    if (!imgUrl) return Promise.resolve(null);
    if (_cache[imgUrl] !== undefined) return Promise.resolve(_cache[imgUrl]);

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const sz = 40;
                const canvas = document.createElement("canvas");
                canvas.width = sz;
                canvas.height = sz;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, sz, sz);
                const data = ctx.getImageData(0, 0, sz, sz).data;
                let r = 0, g = 0, b = 0, n = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    if (lum < 15 || lum > 240) continue; // ignorar preto puro e branco puro
                    r += data[i]; g += data[i + 1]; b += data[i + 2];
                    n++;
                }
                const color = n ? `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})` : null;
                _cache[imgUrl] = color;
                resolve(color);
            } catch {
                _cache[imgUrl] = null;
                resolve(null);
            }
        };
        img.onerror = () => { _cache[imgUrl] = null; resolve(null); };
        img.src = imgUrl;
    });
}
