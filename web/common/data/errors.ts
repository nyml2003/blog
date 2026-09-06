export type DataError =
  | { readonly kind: "cancelled" }
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "timeout" }
  | { readonly kind: "remote"; readonly code: string; readonly message: string }
  | {
      readonly kind: "protocol";
      readonly message: string;
      readonly issues?: readonly string[];
    };

export const cancelled = (): DataError => ({ kind: "cancelled" });
