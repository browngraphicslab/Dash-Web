import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit } from '@fortawesome/free-regular-svg-icons';
import { action, computed, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, DocListCast } from '../../../new_fields/Doc';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { List } from '../../../new_fields/List';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { Cast, NumCast, StrCast } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { ViewBoxBaseComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import './LabelBox.scss';


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
            this.dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this), this.props.Document);
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



    @observable backColor= "unset";

    @observable clicked = false;
    // (!missingParams || !missingParams.length ? "" : "(" + missingParams.map(m => m + ":").join(" ") + ")")
    render() {
        const params = Cast(this.paramsDoc["onClick-paramFieldKeys"], listSpec("string"), []);
        const missingParams = params?.filter(p => !this.paramsDoc[p]);
        params?.map(p => DocListCast(this.paramsDoc[p])); // bcz: really hacky form of prefetching ... 
        console.log(this.backColor);
        return (
            <div className="labelBox-outerDiv" onClick={()=>runInAction(()=>{this.clicked=!this.clicked; this.clicked? this.backColor=StrCast(this.layoutDoc.hovercolor) : this.backColor ="unset"})} onMouseLeave={()=>runInAction(()=>{ !this.clicked ?this.backColor="unset" : null})} 
            onMouseOver={()=>runInAction(()=>{this.backColor=StrCast(this.layoutDoc.hovercolor);})}ref={this.createDropTarget} onContextMenu={this.specificContextMenu}
                style={{ boxShadow: this.layoutDoc.opacity ? StrCast(this.layoutDoc.boxShadow) : "" }}>
                <div className="labelBox-mainButton" style={{
                    background: StrCast(this.layoutDoc.backgroundColor),
                    color: StrCast(this.layoutDoc.color),
                    backgroundColor:this.backColor,
                    fontSize: NumCast(this.layoutDoc.fontSize) || "inherit",
                    fontSize: NumCast(this.layoutDoc._fontSize) || "inherit",
                    fontFamily: StrCast(this.layoutDoc._fontFamily) || "inherit",
                    letterSpacing: StrCast(this.layoutDoc.letterSpacing),
                    textTransform: StrCast(this.layoutDoc.textTransform) as any,
                    paddingLeft: NumCast(this.layoutDoc._xPadding),
                    paddingRight: NumCast(this.layoutDoc._xPadding),
                    paddingTop: NumCast(this.layoutDoc._yPadding),
                    paddingBottom: NumCast(this.layoutDoc._yPadding),
                    textOverflow: this.layoutDoc._singleLine ? "ellipsis" : undefined,
                    whiteSpace: this.layoutDoc._singleLine ? "nowrap" : "pre-wrap"
                }} >
                    <div className="labelBox-mainButtonCenter">
                        {StrCast(this.rootDoc.text, StrCast(this.rootDoc.title))}
                    </div>
                </div>
                <div className="labelBox-fieldKeyParams" >
                    {!missingParams?.length ? (null) : missingParams.map(m => <div key={m} className="labelBox-missingParam">{m}</div>)}
                </div>
            </div>
        );
    }
}