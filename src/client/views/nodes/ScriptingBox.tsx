import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit } from '@fortawesome/free-regular-svg-icons';
import { computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc } from '../../../new_fields/Doc';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { CompileScript } from "../../util/Scripting";
import { ScriptBox } from '../ScriptBox';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, ScriptCast } from '../../../new_fields/Types';
import { DocComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import './ScriptingBox.scss';
import { DocumentIconContainer } from './DocumentIcon';


library.add(faEdit as any);

const ScriptingSchema = createSchema({
    onClick: ScriptField,
    buttonParams: listSpec("string"),
    text: "string"
});

type ScriptingDocument = makeInterface<[typeof ScriptingSchema, typeof documentSchema]>;
const ScriptingDocument = makeInterface(ScriptingSchema, documentSchema);

@observer
export class ScriptingBox extends DocComponent<FieldViewProps, ScriptingDocument>(ScriptingDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ScriptingBox, fieldKey); }

    @computed get dataDoc() {
        return this.props.DataDoc &&
            (this.Document.isTemplateForField || BoolCast(this.props.DataDoc.isTemplateForField) ||
                this.props.DataDoc.layout === this.props.Document) ? this.props.DataDoc : Doc.GetProto(this.props.Document);
    }

    specificContextMenu = (e: React.MouseEvent): void => { }

    render() {
        const script = ScriptCast(this.props.Document[this.props.fieldKey]);
        let originalText: string | undefined = undefined;
        if (script) {
            originalText = script.script.originalScript;
        }
        return !(this.props.Document instanceof Doc) ? (null) :
            <ScriptBox initialText={originalText}
                setParams={() => { }}
                onCancel={() => { }}
                onSave={(text, onError) => {
                    if (!text) {
                        this.dataDoc[this.props.fieldKey] = undefined;
                    } else {
                        const script = CompileScript(text, {
                            params: { this: Doc.name },
                            typecheck: false,
                            editable: true,
                            transformer: DocumentIconContainer.getTransformer()
                        });
                        if (!script.compiled) {
                            onError(script.errors.map(error => error.messageText).join("\n"));
                        }
                        else {
                            this.dataDoc[this.props.fieldKey] = new ScriptField(script);
                        }
                    }
                }} showDocumentIcons />;
    }
}