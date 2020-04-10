import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit } from '@fortawesome/free-regular-svg-icons';
import { action, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, DocListCast } from '../../../new_fields/Doc';
import { List } from '../../../new_fields/List';
import { createSchema, makeInterface, listSpec } from '../../../new_fields/Schema';
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, StrCast, Cast, FieldValue, NumCast } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { ViewBoxBaseComponent } from '../DocComponent';
import './LabelBox.scss';
import { FieldView, FieldViewProps } from './FieldView';
import { ContextMenuProps } from '../ContextMenuItem';
import { ContextMenu } from '../ContextMenu';
import { documentSchema } from '../../../new_fields/documentSchemas';


library.add(faEdit as any);

const LabelSchema = createSchema({});

type LabelDocument = makeInterface<[typeof LabelSchema, typeof documentSchema]>;
const LabelDocument = makeInterface(LabelSchema, documentSchema);

@observer
export class LabelBox extends ViewBoxBaseComponent<FieldViewProps, LabelDocument>(LabelDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(LabelBox, fieldKey); }
    private dropDisposer?: DragManager.DragDropDisposer;

    protected createDropTarget = (ele: HTMLDivElement) => {
        this.dropDisposer?.();
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this));
        }
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({
            description: "Clear Script Params", event: () => {
                const params = Cast(this.dataDoc[this.fieldKey + "-params"], listSpec("string"), []);
                params?.map(p => this.dataDoc[p] = undefined);
            }, icon: "trash"
        });

        ContextMenu.Instance.addItem({ description: "OnClick...", subitems: funcs, icon: "asterisk" });
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        const docDragData = de.complete.docDragData;
        const params = Cast(this.dataDoc[this.fieldKey + "-params"], listSpec("string"), []);
        const missingParams = params?.filter(p => this.dataDoc[p] === undefined);
        if (docDragData && missingParams?.includes((e.target as any).textContent)) {
            this.dataDoc[(e.target as any).textContent] = new List<Doc>(docDragData.droppedDocuments.map((d, i) =>
                d.onDragStart ? docDragData.draggedDocuments[i] : d));
            e.stopPropagation();
        }
    }
    // (!missingParams || !missingParams.length ? "" : "(" + missingParams.map(m => m + ":").join(" ") + ")")
    render() {
        const params = Cast(this.dataDoc[this.fieldKey + "-params"], listSpec("string"), []);
        const missingParams = params?.filter(p => this.dataDoc[p] === undefined);
        params?.map(p => DocListCast(this.dataDoc[p])); // bcz: really hacky form of prefetching ... 
        return (
            <div className="labelBox-outerDiv" ref={this.createDropTarget} onContextMenu={this.specificContextMenu}
                style={{ boxShadow: this.layoutDoc.opacity ? StrCast(this.layoutDoc.boxShadow) : "" }}>
                <div className="labelBox-mainButton" style={{
                    background: StrCast(this.layoutDoc.backgroundColor),
                    color: StrCast(this.layoutDoc.color, "inherit"),
                    fontSize: NumCast(this.layoutDoc.fontSize) || "inherit",
                    letterSpacing: StrCast(this.layoutDoc.letterSpacing),
                    textTransform: StrCast(this.layoutDoc.textTransform) as any
                }} >
                    <div className="labelBox-mainButtonCenter">
                        {StrCast(this.layoutDoc.text, StrCast(this.layoutDoc.title))}
                    </div>
                </div>
                <div className="labelBox-params" >
                    {!missingParams?.length ? (null) : missingParams.map(m => <div key={m} className="labelBox-missingParam">{m}</div>)}
                </div>
            </div>
        );
    }
}