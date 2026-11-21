import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group.tsx";
import { useFormat } from "@/lib/format.ts";

type Props = Omit<ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string | number | undefined;
  onChange: (value: string) => void;
};

/** Amount in the business currency. Holds text so blank stays blank. */
export function MoneyInput({ value, onChange, className, ...props }: Props) {
  const { currencySymbol } = useFormat();
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <InputGroupText>{currencySymbol}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </InputGroup>
  );
}

/** Whole-number quantity. */
export function QuantityInput({ value, onChange, ...props }: Props) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]*"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}
