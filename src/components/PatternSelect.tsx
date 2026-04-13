import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PatternSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
}

const defaultPatterns = [
  { value: "auto", label: "Automático (seguir referência)" },
  { value: "pizza", label: "Pizza — Madeira escura + Luz quente" },
  { value: "hamburguer", label: "Hambúrguer — Fundo escuro + Luz dramática" },
  { value: "marmita", label: "Marmita — Prato branco + Luz neutra" },
  { value: "sobremesa", label: "Sobremesa — Fundo claro + Luz suave" },
  { value: "japones", label: "Japonês — Fundo escuro + Contraste alto" },
  { value: "acai", label: "Açaí / Smoothie — Fundo claro + Vibração" },
  { value: "arabe", label: "Árabe / Grelhados — Fundo amadeirado + Tom quente" },
  { value: "executivo", label: "Prato Executivo — Minimalista + Profissional" },
];

const PatternSelect = ({
  label = "Tipo de Padrão",
  value,
  onChange,
  options = defaultPatterns,
}: PatternSelectProps) => (
  <div className="space-y-2">
    <label className="text-sm font-medium text-foreground">{label}</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full bg-card border-border">
        <SelectValue placeholder="Selecione o padrão" />
      </SelectTrigger>
      <SelectContent>
        {options.map((p) => (
          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export default PatternSelect;
