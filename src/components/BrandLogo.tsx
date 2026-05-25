import logoWhite from "@/assets/brand/logo-branco.png";
import logoBlack from "@/assets/brand/logo-preto.png";
import logoIcon from "@/assets/brand/icon-ia.png";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  imageClassName?: string;
  variant?: "full" | "icon";
}

export function BrandLogo({ className, imageClassName, variant = "full" }: BrandLogoProps) {
  if (variant === "icon") {
    return (
      <div className={cn("flex items-center", className)} aria-label="Cardápio Pro IA">
        <img
          src={logoIcon}
          alt="Cardápio Pro IA"
          className={cn("block", imageClassName)}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", className)} aria-label="Cardápio Pro IA">
      <img
        src={logoBlack}
        alt="Cardápio Pro IA"
        className={cn("block dark:hidden", imageClassName)}
      />
      <img
        src={logoWhite}
        alt="Cardápio Pro IA"
        className={cn("hidden dark:block", imageClassName)}
      />
    </div>
  );
}
