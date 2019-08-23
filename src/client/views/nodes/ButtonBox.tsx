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
import { StrCast, BoolCast } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { action, computed } from 'mobx';
import { List } from '../../../new_fields/List';

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
    private dropDisposer?: DragManager.DragDropDisposer;

    @computed get dataDoc() { return this.props.DataDoc && (BoolCast(this.props.Document.isTemplate) || BoolCast(this.props.DataDoc.isTemplate) || this.props.DataDoc.layout === this.props.Document) ? this.props.DataDoc : Doc.GetProto(this.props.Document); }


    protected createDropTarget = (ele: HTMLDivElement) => {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }
    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            Doc.GetProto(this.dataDoc).source = new List<Doc>(de.data.droppedDocuments);
        }
    }
    render() {
        return (
            <div className="buttonBox-outerDiv" ref={this.createDropTarget} >
                <div className="buttonBox-mainButton" style={{ background: StrCast(this.props.Document.backgroundColor), color: StrCast(this.props.Document.color, "black") }} >{this.Document.text || this.Document.title}</div>
            </div>
        );
    }
}