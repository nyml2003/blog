import { createContext } from "solid-js";

// Shared association contract; atoms do not depend on the Field molecule.
export const FieldControlContext = createContext<string>();
