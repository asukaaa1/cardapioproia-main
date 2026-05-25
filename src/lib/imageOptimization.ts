const MAX_UPLOAD_DIMENSION = 1600;
const OUTPUT_QUALITY = 0.82;
const MAX_DIRECT_UPLOAD_SIZE = 1.5 * 1024 * 1024;

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível ler a imagem enviada."));
    image.src = dataUrl;
  });
}

function getTargetSize(width: number, height: number) {
  const largestSide = Math.max(width, height);
  if (largestSide <= MAX_UPLOAD_DIMENSION) {
    return { width, height };
  }

  const scale = MAX_UPLOAD_DIMENSION / largestSide;

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canKeepOriginalFile(file: File, width: number, height: number) {
  const isAlreadySmallEnough =
    Math.max(width, height) <= MAX_UPLOAD_DIMENSION &&
    file.size <= MAX_DIRECT_UPLOAD_SIZE;

  const isSafeOriginalType = ["image/jpeg", "image/jpg", "image/webp", "image/png"].includes(file.type);

  return isAlreadySmallEnough && isSafeOriginalType;
}

export async function optimizeImageDataUrl(file: File) {
  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });

  const image = await loadImage(originalDataUrl);
  if (canKeepOriginalFile(file, image.naturalWidth, image.naturalHeight)) {
    return originalDataUrl;
  }

  const { width, height } = getTargetSize(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return originalDataUrl;
  }

  context.drawImage(image, 0, 0, width, height);

  const optimizedMimeType = file.type === "image/png" ? "image/jpeg" : "image/webp";
  const optimizedDataUrl = canvas.toDataURL(optimizedMimeType, OUTPUT_QUALITY);

  // If the browser couldn't encode to the requested format, keep a safe fallback.
  if (!optimizedDataUrl.startsWith("data:image/")) {
    return originalDataUrl;
  }

  return optimizedDataUrl;
}
