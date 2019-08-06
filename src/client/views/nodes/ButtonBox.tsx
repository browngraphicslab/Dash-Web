import * as React from 'react';
import { FieldViewProps, FieldView } from './FieldView';
import { createSchema, makeInterface } from '../../../new_fields/Schema';
import { ScriptField } from '../../../new_fields/ScriptField';
import { DocComponent } from '../DocComponent';
import { ContextMenu } from '../ContextMenu';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit } from '@fortawesome/free-regular-svg-icons';
import { emptyFunction } from '../../../Utils';
import { ScriptBox } from '../ScriptBox';
import { CompileScript } from '../../util/Scripting';
import { OverlayView } from '../OverlayView';
import { Doc } from '../../../new_fields/Doc';

import './ButtonBox.scss';
import { observer } from 'mobx-react';
import { DocumentIconContainer } from './DocumentIcon';

library.add(faEdit as any);

const ButtonSchema = createSchema({
    onClick: ScriptField,
    text: "string"
});

type ButtonDocument = makeInterface<[typeof ButtonSchema]>;
const ButtonDocument = makeInterface(ButtonSchema);

@observer
export class ButtonBox extends DocComponent<FieldViewProps, ButtonDocument>(ButtonDocument) {
    public static LayoutString() { return FieldView.LayoutString(ButtonBox); }

    onClick = (e: React.MouseEvent) => {
        const onClick = this.Document.onClick;
        if (!onClick) {
            return;
        }
        e.stopPropagation();
        e.preventDefault();
        onClick.script.run({ this: this.props.Document });
    }

    onContextMenu = () => {
        ContextMenu.Instance.addItem({
            description: "Edit OnClick script", icon: "edit", event: () => {
                let overlayDisposer: () => void = emptyFunction;
                const script = this.Document.onClick;
                let originalText: string | undefined = undefined;
                if (script) originalText = script.script.originalScript;
                // tslint:disable-next-line: no-unnecessary-callback-wrapper
                let scriptingBox = <ScriptBox initialText={originalText} onCancel={() => overlayDisposer()} onSave={(text, onError) => {
                    const script = CompileScript(text, {
                        params: { this: Doc.name },
                        typecheck: false,
                        editable: true,
                        transformer: DocumentIconContainer.getTransformer()
                    });
                    if (!script.compiled) {
                        onError(script.errors.map(error => error.messageText).join("\n"));
                        return;
                    }
                    this.Document.onClick = new ScriptField(script);
                    overlayDisposer();
                }} showDocumentIcons />;
                overlayDisposer = OverlayView.Instance.addWindow(scriptingBox, { x: 400, y: 200, width: 500, height: 400, title: `${this.Document.title || ""} OnClick` });
            }
        });
    }

    render() {
        return (
            <div className="buttonBox-outerDiv" onContextMenu={this.onContextMenu}>
                <button className="buttonBox-mainButton" onClick={this.onClick}>{this.Document.text || this.Document.title || "Button"}</button>
            </div>
        );
    }
}