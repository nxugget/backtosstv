import { Field } from "@/components/shack/field";
import { shackInputClass } from "@/components/shack/styles";
import type { OperatorOption } from "@/lib/shack";

interface OperatorSelectProps {
  defaultValue: string | null;
  id: string;
  operators: readonly OperatorOption[];
}

/**
 * The organisation a satellite's transmissions usually come from, which the event form fills in
 * when this satellite is chosen. Optional on purpose: a satellite several organisations transmit
 * from has no usual one, and saying so is better than picking a favourite.
 */
export function OperatorSelect({ defaultValue, id, operators }: OperatorSelectProps) {
  return (
    <Field
      htmlFor={id}
      hint="Filled in for you when this satellite is chosen on the event screen, and still editable there. Optional."
      label="Usual operator"
    >
      <select
        id={id}
        name="default_operator_id"
        className={shackInputClass}
        defaultValue={defaultValue ?? ""}
      >
        <option value="">No usual operator</option>
        {operators.map((operator) => (
          <option key={operator.id} value={operator.id}>
            {operator.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
