import { useState, useEffect } from "react";
import { X, Sparkles, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "onboarding-seen-v1";

const steps = [
  {
    icon: Upload,
    title: "Envie sua foto",
    description:
      "Tire uma foto do seu prato com o celular mesmo. Não precisa ser profissional — a IA cuida do resto.",
  },
  {
    icon: Sparkles,
    title: "Escolha um estilo",
    description:
      "Selecione um padrão (pizza, marmita, japonês...) ou envie uma foto de referência de como você quer que fique.",
  },
  {
    icon: Download,
    title: "Baixe pronto",
    description:
      "Em segundos você recebe uma foto profissional pronta para usar no iFood, Cardápio Digital ou redes sociais.",
  },
];

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  if (!open) return null;

  const step = steps[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative glass-card w-full max-w-sm p-8 space-y-6 text-center shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icone */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-8 h-8 text-primary" />
          </div>
        </div>

        {/* Conteudo */}
        <div className="space-y-2">
          <p className="text-xs text-primary font-semibold uppercase tracking-wide">
            Passo {currentStep + 1} de {steps.length}
          </p>
          <h2 className="text-xl font-display font-bold text-foreground">{step.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentStep ? "bg-primary w-5" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Botoes */}
        <div className="flex gap-3">
          {!isLast && (
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Pular
            </Button>
          )}
          <Button
            className="flex-1 font-display font-semibold"
            onClick={() => {
              if (isLast) {
                handleClose();
              } else {
                setCurrentStep((s) => s + 1);
              }
            }}
          >
            {isLast ? "Começar agora" : "Próximo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
