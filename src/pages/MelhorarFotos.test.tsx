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
    profile: { role: "user" },
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
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
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
    <button type="button" onClick={() => onImageChange("data:image/png;base64,YWJj")}>
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
        json: async () => ({ image: "data:image/png;base64,YWJjZA==" }),
      }),
    );
  });

  it("imports an iFood item and sends it to the menu item generation mode", async () => {
    insertMock.mockReturnValue({
      select: () => ({
        single: async () => ({
          data: { id: "photo-1" },
          error: null,
        }),
      }),
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          restaurant: {
            name: "Burger Test",
            url: "https://www.ifood.com.br/delivery/test-store",
            merchantId: "merchant-1",
            mainImageUrl: null,
          },
          items: [
            {
              id: "item-1",
              sectionName: "Lanches",
              name: "X Bacon",
              description: "Pao, burger e bacon",
              imageUrl: "https://static-images.ifood.com.br/item.jpg",
              price: 29.9,
              availability: "AVAILABLE",
            },
          ],
          counts: {
            totalItems: 1,
            itemsWithImages: 1,
            skippedWithoutImage: 0,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image: "data:image/png;base64,YWJjZA==" }),
      });

    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Item do iFood/i }));
    fireEvent.change(screen.getByPlaceholderText("https://www.ifood.com.br/delivery/..."), {
      target: { value: "https://www.ifood.com.br/delivery/test-store" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Buscar itens/i }));

    await waitFor(() => {
      expect(screen.getByText("X Bacon")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Referência de estilo" }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar foto do item/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const generationPayload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(generationPayload).toMatchObject({
      mode: "menu_item",
      itemName: "X Bacon",
      itemDescription: "Pao, burger e bacon",
      sourceImageUrl: "https://static-images.ifood.com.br/item.jpg",
      referenceImage: "data:image/png;base64,YWJj",
      restaurantUrl: "https://www.ifood.com.br/delivery/test-store",
    });
  });

  it("warns when the imported iFood menu has no items with images", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          restaurant: {
            name: "No Photo Store",
            url: "https://www.ifood.com.br/delivery/no-photo-store",
            merchantId: "merchant-2",
            mainImageUrl: null,
          },
          items: [],
          counts: {
            totalItems: 4,
            itemsWithImages: 0,
            skippedWithoutImage: 4,
          },
        }),
      }),
    );

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Item do iFood/i }));
    fireEvent.change(screen.getByPlaceholderText("https://www.ifood.com.br/delivery/..."), {
      target: { value: "https://www.ifood.com.br/delivery/no-photo-store" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Buscar itens/i }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith("Nenhum item com imagem foi encontrado nesse cardápio.", {
        id: "import-ifood-menu",
      });
    });
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

    expect(toast.success).toHaveBeenCalledWith("Imagem processada com sucesso!", { id: "processing" });
    expect(screen.getByText("Resultado")).toBeInTheDocument();
  });
});
