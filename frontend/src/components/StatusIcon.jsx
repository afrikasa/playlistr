import { CheckCircle2, Loader2, XCircle, Circle, MinusCircle } from "lucide-react";

export const StatusIcon = ({ status, className = "" }) => {
    switch (status) {
        case "downloading":
            return (
                <Loader2
                    className={`w-5 h-5 text-[#1DB954] animate-spin ${className}`}
                    data-testid="status-downloading"
                />
            );
        case "done":
            return (
                <CheckCircle2
                    className={`w-5 h-5 text-[#1DB954] ${className}`}
                    data-testid="status-done"
                />
            );
        case "failed":
            return (
                <XCircle
                    className={`w-5 h-5 text-red-500 ${className}`}
                    data-testid="status-failed"
                />
            );
        case "skipped":
            return (
                <MinusCircle
                    className={`w-5 h-5 text-yellow-500 ${className}`}
                    data-testid="status-skipped"
                />
            );
        default:
            return (
                <Circle
                    className={`w-5 h-5 text-neutral-700 ${className}`}
                    data-testid="status-queued"
                />
            );
    }
};
