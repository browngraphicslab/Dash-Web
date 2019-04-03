import { BasicField } from "./BasicField";
import { FieldId } from "./Field";
import { Types } from "../server/Message";

export class MinimizedField extends BasicField<boolean> {
  constructor(
    data: boolean = false as boolean,
    id?: FieldId,
    save: boolean = true as boolean
  ) {
    super(data, save, id);
  }

  ToScriptString(): string {
    return `new MinimizedField("${this.Data}")`;
  }

  Copy() {
    return new MinimizedField(this.Data);
  }

  ToJson(): { type: Types; data: boolean; _id: string } {
    return {
      type: Types.Minimized,
      data: this.Data,
      _id: this.Id
    };
  }
}
