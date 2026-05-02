import { Settings2 } from "lucide-react";

const XFADE_OPTIONS = [
    { value: 0,  label: "Desligado" },
    { value: 1,  label: "1s" },
    { value: 2,  label: "2s" },
    { value: 3,  label: "3s" },
    { value: 5,  label: "5s" },
];

const QUALITY_OPTIONS = [
    { value: "128", label: "128 kbps" },
    { value: "192", label: "192 kbps" },
    { value: "320", label: "320 kbps" },
];

export function SettingsView({ settings, onUpdate }) {
    const xfade = settings.xfadeSecs ?? 3;
    const quality = settings.defaultQuality || "192";

    return (
        <div className="space-y-6 fade-up">
            <h2 className="text-lg font-bold">Definições</h2>

            <Section title="Reprodução" icon={<Settings2 className="w-4 h-4" />}>
                <SettingRow label="Crossfade" sub="Duração da transição suave entre faixas">
                    <div className="flex gap-1.5 flex-wrap justify-end">
                        {XFADE_OPTIONS.map((o) => (
                            <button
                                key={o.value}
                                onClick={() => onUpdate({ ...settings, xfadeSecs: o.value })}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                                    xfade === o.value
                                        ? "bg-[#1DB954] text-black border-[#1DB954]"
                                        : "bg-white/5 text-neutral-400 hover:text-white border-white/10"
                                }`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </SettingRow>
            </Section>

            <Section title="Download">
                <SettingRow label="Qualidade padrão" sub="Bitrate dos ficheiros MP3 descarregados">
                    <div className="flex gap-1.5 flex-wrap justify-end">
                        {QUALITY_OPTIONS.map((o) => (
                            <button
                                key={o.value}
                                onClick={() => onUpdate({ ...settings, defaultQuality: o.value })}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                                    quality === o.value
                                        ? "bg-[#1DB954] text-black border-[#1DB954]"
                                        : "bg-white/5 text-neutral-400 hover:text-white border-white/10"
                                }`}
                            >
                                {o.value} kbps
                            </button>
                        ))}
                    </div>
                </SettingRow>
            </Section>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">{title}</p>
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] divide-y divide-white/5">
                {children}
            </div>
        </div>
    );
}

function SettingRow({ label, sub, children }) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
            </div>
            <div className="flex-shrink-0">{children}</div>
        </div>
    );
}
