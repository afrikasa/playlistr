import { getCategoryColor } from "@/utils/categoryColors";

export const CategoryBadge = ({ category }) => {
    const { hex, label } = getCategoryColor(category);

    return (
        <span
            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-white whitespace-nowrap"
            style={{ backgroundColor: hex }}
            title={label}
        >
            {label}
        </span>
    );
};
