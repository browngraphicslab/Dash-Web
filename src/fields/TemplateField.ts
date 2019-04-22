import { BasicField } from "./BasicField";
import { Types } from "../server/Message";
import { FieldId } from "./Field";
import { Template, TemplatePosition } from "../client/views/Templates";


export class TemplateField extends BasicField<Array<Template>> {
    constructor(data: Array<Template> = [], id?: FieldId, save: boolean = true) {
        super(data, save, id);
    }

    ToScriptString(): string {
        return `new TemplateField("${this.Data}")`;
    }

    Copy() {
        return new TemplateField(this.Data);
    }

    ToJson() {
        let templates: Array<{ name: string, position: TemplatePosition, layout: string }> = [];
        this.Data.forEach(template => {
            templates.push({ name: template.Name, layout: template.Layout, position: template.Position });
        });
        return {
            type: Types.Templates,
            data: templates,
            id: this.Id,
        };
    }

    UpdateFromServer(data: any) {
        this.data = new Array(data);
    }

    static FromJson(id: string, data: any): TemplateField {
        let templates: Array<Template> = [];
        data.forEach((template: { name: string, position: number, layout: string }) => {
            templates.push(new Template(template.name, template.position, template.layout));
        });
        return new TemplateField(templates, id, false);
    }
}