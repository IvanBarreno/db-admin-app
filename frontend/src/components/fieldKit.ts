// fieldKit.ts — small helpers shared by every form control, so all fields are labelled and explained the
// same way: label above, the control, the help text BELOW it, then the error.
// (No components here: a file that exports only functions keeps React fast refresh working for the others.)

import type { OperationParameter } from '../api/operations'

/**
 * Order of the parts of a Mantine input. The default puts the description between the label and the
 * control; here the help text goes under the control, where the eye lands after typing.
 */
export const WRAPPER_ORDER: ('label' | 'input' | 'description' | 'error')[] = ['label', 'input', 'description', 'error']

/** The words on a field: the YAML `label`, or a readable form of the parameter name ("login_name" → "login name"). */
export function fieldLabel(param: OperationParameter): string {
  return param.label ?? param.name.replaceAll('_', ' ')
}

/**
 * Props every Mantine input understands (TextInput, Select, NumberInput, Input.Wrapper...). Spread them:
 *   <TextInput {...fieldProps(param)} value={...} />
 * `withAsterisk` only draws the red star; whether the value is really required is enforced by the API.
 */
export function fieldProps(param: OperationParameter) {
  return {
    label: fieldLabel(param),
    description: param.help ?? undefined,
    withAsterisk: param.required,
    inputWrapperOrder: WRAPPER_ORDER,
  }
}
