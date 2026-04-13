import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
}

export const defaultAdjustments: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 0,
};

export function buildFilterStyle(adj: Adjustments): React.CSSProperties {
  return {
    filter: `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%)`,
  };
}

interface ImageAdjustmentsProps {
  value: Adjustments;
  onChange: (adj: Adjustments) => void;
}

const controls = [
  { key: "brightness" as const, label: "Brilho", min: 50, max: 150, unit: "%" },
  { key: "contrast" as const, label: "Contraste", min: 50, max: 150, unit: "%" },
  { key: "saturation" as const, label: "Saturação", min: 0, max: 200, unit: "%" },
];

export function ImageAdjustments({ value, onChange }: ImageAdjustmentsProps) {
  const isDefault =
    value.brightness === 100 &&
    value.contrast === 100 &&
    value.saturation === 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Ajustes</p>
        {!isDefault && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => onChange(defaultAdjustments)}
          >
            <RotateCcw className="w-3 h-3 mr-1" /> Resetar
          </Button>
        )}
      </div>
      {controls.map(({ key, label, min, max }) => (
        <div key={key} className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{label}</span>
            <span>{value[key]}{key !== "sharpness" ? "%" : ""}</span>
          </div>
          <Slider
            min={min}
            max={max}
            step={1}
            value={[value[key]]}
            onValueChange={([v]) => onChange({ ...value, [key]: v })}
          />
        </div>
      ))}
    </div>
  );
}
