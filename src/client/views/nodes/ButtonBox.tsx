import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit } from '@fortawesome/free-regular-svg-icons';
import { action, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, DocListCast } from '../../../new_fields/Doc';
import { List } from '../../../new_fields/List';
import { createSchema, makeInterface, listSpec } from '../../../new_fields/Schema';
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, StrCast, Cast, FieldValue } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { DocComponent } from '../DocComponent';
import './ButtonBox.scss';
import { FieldView, FieldViewProps } from './FieldView';
import { ContextMenuProps } from '../ContextMenuItem';
import { ContextMenu } from '../ContextMenu';
import { documentSchema } from '../../../new_fields/documentSchemas';


library.add(faEdit as any);

const ButtonSchema = createSchema({
    onClick: ScriptField,
    buttonParams: listSpec("string"),
    text: "string"
});

type ButtonDocument = makeInterface<[typeof ButtonSchema, typeof documentSchema]>;
const ButtonDocument = makeInterface(ButtonSchema, documentSchema);

@observer
export class ButtonBox extends DocComponent<FieldViewProps, ButtonDocument>(ButtonDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ButtonBox, fieldKey); }
    private dropDisposer?: DragManager.DragDropDisposer;

    @computed get dataDoc() {
        return this.props.DataDoc &&
            (this.Document.isTemplateField || BoolCast(this.props.DataDoc.isTemplateField) ||
                this.props.DataDoc.layout === this.props.Document) ? this.props.DataDoc : Doc.GetProto(this.props.Document);
    }


    protected createDropTarget = (ele: HTMLDivElement) => {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        let funcs: ContextMenuProps[] = [];
        funcs.push({
            description: "Clear Script Params", event: () => {
                let params = FieldValue(this.Document.buttonParams);
                params && params.map(p => this.props.Document[p] = undefined);
            }, icon: "trash"
        });

        ContextMenu.Instance.addItem({ description: "OnClick...", subitems: funcs, icon: "asterisk" });
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData && e.target) {
            this.props.Document[(e.target as any).textContent] = new List<Doc>(de.data.droppedDocuments.map((d, i) =>
                d.onDragStart ? de.data.draggedDocuments[i] : d));
            e.stopPropagation();
        }
    }
    // (!missingParams || !missingParams.length ? "" : "(" + missingParams.map(m => m + ":").join(" ") + ")")
    render() {
        let params = this.Document.buttonParams;
        let missingParams = params && params.filter(p => this.props.Document[p] === undefined);
        params && params.map(p => DocListCast(this.props.Document[p])); // bcz: really hacky form of prefetching ... 
        return (
            <div className="buttonBox-outerDiv" ref={this.createDropTarget} onContextMenu={this.specificContextMenu}
                style={{ boxShadow: this.Document.opacity === 0 ? undefined : StrCast(this.Document.boxShadow, "") }}>
                <div className="buttonBox-mainButton" style={{ background: this.Document.backgroundColor || "", color: this.Document.color || "black" }} >
                    <div className="buttonBox-mainButtonCenter">
                        {(this.Document.text || this.Document.title)}
                    </div>
                </div>
                <div className="buttonBox-params" >
                    {!missingParams || !missingParams.length ? (null) : missingParams.map(m => <div key={m} className="buttonBox-missingParam">{m}</div>)}
                </div>
            </div>
        );
    }
}