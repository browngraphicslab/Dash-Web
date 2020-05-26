import { action } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, DocListCast } from '../../../fields/Doc';
import { documentSchema } from '../../../fields/documentSchemas';
import { List } from '../../../fields/List';
import { createSchema, listSpec, makeInterface } from '../../../fields/Schema';
import { Cast, NumCast, StrCast } from '../../../fields/Types';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { ViewBoxBaseComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import './LabelBox.scss';

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

    get paramsDoc() { return Doc.AreProtosEqual(this.layoutDoc, this.dataDoc) ? this.dataDoc : this.layoutDoc; }
    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({
            description: "Clear Script Params", event: () => {
                const params = Cast(this.paramsDoc["onClick-paramFieldKeys"], listSpec("string"), []);
                params?.map(p => this.paramsDoc[p] = undefined);
            }, icon: "trash"
        });

        ContextMenu.Instance.addItem({ description: "OnClick...", subitems: funcs, icon: "asterisk" });
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        const docDragData = de.complete.docDragData;
        const params = Cast(this.paramsDoc["onClick-paramFieldKeys"], listSpec("string"), []);
        const missingParams = params?.filter(p => !this.paramsDoc[p]);
        if (docDragData && missingParams?.includes((e.target as any).textContent)) {
            this.paramsDoc[(e.target as any).textContent] = new List<Doc>(docDragData.droppedDocuments.map((d, i) =>
                d.onDragStart ? docDragData.draggedDocuments[i] : d));
            e.stopPropagation();
        }
    }
    // (!missingParams || !missingParams.length ? "" : "(" + missingParams.map(m => m + ":").join(" ") + ")")
    render() {
        const params = Cast(this.paramsDoc["onClick-paramFieldKeys"], listSpec("string"), []);
        const missingParams = params?.filter(p => !this.paramsDoc[p]);
        params?.map(p => DocListCast(this.paramsDoc[p])); // bcz: really hacky form of prefetching ... 
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
                <div className="labelBox-fieldKeyParams" >
                    {!missingParams?.length ? (null) : missingParams.map(m => <div key={m} className="labelBox-missingParam">{m}</div>)}
                </div>
            </div>
        );
    }
}