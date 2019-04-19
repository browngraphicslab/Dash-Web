import { BasicField } from "./BasicField";
import { Types } from "../server/Message";
import { FieldId } from "./Field";
import { Template, Templates } from "../client/views/Templates";


export class TemplateField extends BasicField<Template> {
    constructor(data: Template = Templates.BasicLayout, id?: FieldId, save: boolean = true) {
        super(data, save, id);
    }

    ToScriptString(): string {
        return `new TemplateField("${this.Data}")`;
    }

    Copy() {
        return new TemplateField(this.Data);
    }

    ToJson() {
        return {
            type: Types.Template,
            data: this.Data,
            id: this.Id,
        };
    }

    UpdateFromServer(data: any) {
        this.data = new Template(data.Name, data.layout);
    }

    static FromJson(id: string, data: any): TemplateField {
        return new TemplateField(new Template(data._name, data._layout), id, false);
    }
}