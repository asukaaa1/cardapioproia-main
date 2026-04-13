import { useCallback, useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface ImageUploadZoneProps {
  label: string;
  sublabel: string;
  image: string | null;
  onImageChange: (image: string | null) => void;
}

const MAX_SIZE_MB = 10;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

interface ImageWarning {
  message: string;
}

function checkImageQuality(img: HTMLImageElement): ImageWarning | null {
  if (img.naturalWidth < 400 || img.naturalHeight < 400) {
    return { message: "Resolução baixa — pode reduzir a qualidade do resultado" };
  }
  return null;
}

const ImageUploadZone = ({ label, sublabel, image, onImageChange }: ImageUploadZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [warning, setWarning] = useState<ImageWarning | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Formato inválido. Use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Imagem muito grande. Máximo ${MAX_SIZE_MB}MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setWarning(checkImageQuality(img));
      };
      img.src = dataUrl;
      onImageChange(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [onImageChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleClear = () => {
    onImageChange(null);
    setWarning(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (image) {
    return (
      <div className="space-y-1.5">
        <div className="relative group rounded-xl overflow-hidden aspect-[4/3]">
          <img src={image} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              onClick={handleClear}
              className="bg-destructive text-destructive-foreground rounded-full p-2 hover:scale-110 transition-transform"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <span className="absolute bottom-3 left-3 text-xs font-medium bg-background/70 backdrop-blur-sm px-2 py-1 rounded-md text-foreground">
            {label}
          </span>
        </div>
        {warning && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{warning.message}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`upload-zone aspect-[4/3] ${isDragOver ? "border-primary bg-primary/5" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        {isDragOver ? <Upload className="w-6 h-6 text-primary" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
      </div>
      <span className="text-xs text-muted-foreground/60">JPG, PNG, WebP • máx. {MAX_SIZE_MB}MB</span>
    </div>
  );
};

export default ImageUploadZone;
