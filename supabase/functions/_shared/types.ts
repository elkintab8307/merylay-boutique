export type Canal = "web" | "whatsapp" | "pos";
export type RolRemitente = "owner" | "customer";

export interface ItemCarrito {
  productId: string;
  variantId: string | null;
  imageId: string | null;
  qty: number;
  unitPrice: number;
  nameSnapshot: string;
}

export interface PendingConfirmation {
  action: string;
  params: Record<string, unknown>;
}

export interface SessionData {
  cart: ItemCarrito[];
  pendingConfirmation: PendingConfirmation | null;
}

export interface AgentDecision {
  action: string;
  params: Record<string, unknown>;
  response_message: string;
}

export type OutgoingMessage =
  | { type: "text"; body: string }
  | { type: "image"; link: string; caption?: string }
  | { type: "document"; link: string; filename: string };

export function sessionVacia(): SessionData {
  return { cart: [], pendingConfirmation: null };
}
