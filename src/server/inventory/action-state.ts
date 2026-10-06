export type InventoryActionState = {
  status: "idle" | "success" | "error";
  message: string;
  purchase: { id: string; totalPaise: number; paidPaise: number; balancePaise: number; supplierName: string } | null;
};

export const initialInventoryActionState: InventoryActionState = { status: "idle", message: "", purchase: null };
