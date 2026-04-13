import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const toast = {
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "22222222-2222-2222-2222-222222222222" },
    session: { access_token: "test-token" },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token", expires_at: Math.floor(Date.now() / 1000) + 3600 } },
        error: null,
      }),
      refreshSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token", expires_at: Math.floor(Date.now() / 1000) + 3600 } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === "user_credits") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { credits: 3 }, error: null }),
            }),
          }),
        };
      }

      if (table === "user_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { plan: "prata", status: "active" }, error: null }),
            }),
          }),
        };
      }

      return {
        insert: insertMock,
      };
    },
  },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/components/ImageUploadZone", () => ({
  default: ({
    label,
    onImageChange,
  }: {
    label: string;
    onImageChange: (image: string) => void;
  }) => (
    <button type="button" onClick={() => onImageChange("data:image/png;base64,abc")}>
      {label}
    </button>
  ),
}));

vi.mock("@/components/PatternSelect", () => ({
  default: () => <div>pattern-select</div>,
}));

vi.mock("@/components/BeforeAfterSlider", () => ({
  default: () => <div>slider</div>,
}));

vi.mock("@/components/ImageAdjustments", () => ({
  ImageAdjustments: () => <div>adjustments</div>,
  defaultAdjustments: {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpness: 0,
  },
  buildFilterStyle: () => ({ filter: "none" }),
}));

const { default: MelhorarFotos } = await import("@/pages/MelhorarFotos");

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MelhorarFotos />
    </QueryClientProvider>,
  );
}

describe("MelhorarFotos", () => {
  beforeEach(() => {
    insertMock.mockReset();
    Object.values(toast).forEach((mockFn) => mockFn.mockReset());
    localStorage.clear();
    localStorage.setItem("foto-delivery-session", "11111111-1111-1111-1111-111111111111");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ image: "data:image/png;base64,processed" }),
      }),
    );
  });

  it("warns the user when the image is generated but history persistence fails", async () => {
    insertMock.mockReturnValue({
      select: () => ({
        single: async () => ({
          error: { message: "new row violates row-level security policy" },
        }),
      }),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Foto do produto" }));
    fireEvent.click(screen.getByRole("button", { name: "Referência de estilo" }));
    const generateButton = screen.getByRole("button", { name: /Gerar foto/i });

    await waitFor(() => {
      expect(generateButton).not.toBeDisabled();
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        "Imagem gerada, mas não foi possível salvá-la no histórico. Você ainda pode baixá-la agora.",
        { id: "processing" },
      );
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText("Resultado")).toBeInTheDocument();
  });
});
