import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faAsterisk, faBrain, faFileAudio, faImage, faPaintBrush } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction } from 'mobx';
import { observer } from "mobx-react";
import { DataSym, Doc, DocListCast, HeightSym, WidthSym } from '../../../new_fields/Doc';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { ObjectField } from '../../../new_fields/ObjectField';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { ComputedField } from '../../../new_fields/ScriptField';
import { Cast, NumCast, StrCast } from '../../../new_fields/Types';
import { AudioField, ImageField } from '../../../new_fields/URLField';
import { TraceMobx } from '../../../new_fields/util';
import { emptyFunction, returnOne, Utils, returnZero } from '../../../Utils';
import { CognitiveServices, Confidence, Service, Tag } from '../../cognitive_services/CognitiveServices';
import { Docs } from '../../documents/Documents';
import { DragManager } from '../../util/DragManager';
import { SelectionManager } from '../../util/SelectionManager';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { ViewBoxAnnotatableComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import "./ComparisonBox.scss";
import React = require("react");
import { ContentFittingDocumentView } from './ContentFittingDocumentView';

library.add(faImage, faEye as any, faPaintBrush, faBrain);
library.add(faFileAudio, faAsterisk);


export const pageSchema = createSchema({
    beforeDoc: "string",
    afterDoc: "string"
});

type ComparisonDocument = makeInterface<[typeof pageSchema, typeof documentSchema]>;
const ComparisonDocument = makeInterface(pageSchema, documentSchema);


@observer
export class ComparisonBox extends ViewBoxAnnotatableComponent<FieldViewProps, ComparisonDocument>(ComparisonDocument) {
    protected multiTouchDisposer?: import("../../util/InteractionUtils").InteractionUtils.MultiTouchEventDisposer | undefined;
    protected beforeDoc: Doc | undefined;
    protected afterDoc: Doc | undefined;

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ComparisonBox, fieldKey); }

    private _beforeDropDisposer?: DragManager.DragDropDisposer;
    private _afterDropDisposer?: DragManager.DragDropDisposer;

    protected createBeforeDropTarget = (ele: HTMLDivElement) => {
        this._beforeDropDisposer && this._beforeDropDisposer();
        ele && (this._beforeDropDisposer = DragManager.MakeDropTarget(ele, (event, dropEvent) => {
            this.beforeDoc = dropEvent.complete.docDragData.droppedDocuments[0];
        }));
    }

    protected createAfterDropTarget = (ele: HTMLDivElement) => {
        this._afterDropDisposer && this._afterDropDisposer();
        ele && (this._afterDropDisposer = DragManager.MakeDropTarget(ele, (event, dropEvent) => {
            this.afterDoc = dropEvent.complete.docDragData.droppedDocuments[0];
        }));
        // this.afterDropHandler(this._afterDropDisposer);
    }

    beforeDropHandler = (ele: any) => {

    }

    afterDropHandler = (ele: any) => {

    }

    clearBeforeDoc = (e: PointerEvent) => {
        e.stopPropagation;
        this.beforeDoc = undefined;
    }

    clearAfterDoc = (e: PointerEvent) => {
        e.stopPropagation;
        this.afterDoc = undefined;
    }

    get fieldKey() {
        return this.props.fieldKey.startsWith("@") ? StrCast(this.props.Document[this.props.fieldKey]) : this.props.fieldKey;
    }

    render() {
        TraceMobx();
        const dragging = !SelectionManager.GetIsDragging() ? "" : "-dragging";
        const beforeDoc = this.props.Document.beforeDoc as Doc;
        return (
            <div className={`comparisonBox${dragging}`}>
                {
                    beforeDoc ?
                        <div className="beforeBox-cont" key={this.props.Document[Id]} ref={this.createBeforeDropTarget}>
                            <ContentFittingDocumentView {...this.props}
                                Document={beforeDoc}
                                getTransform={this.props.ScreenToLocalTransform} />
                        </div> : null
                }

                {/* {
                    beforeDoc ? 
                    <div className="beforeBox-cont" key={this.props.Document[Id]} ref={this.createBeforeDropTarget}>
                        <ContentFittingDocumentView {...this.props}
                            Document={beforeDoc}
                            getTransform={this.props.ScreenToLocalTransform} />
                    </div> : null
                }
                <div className="beforeBox-cont" key={this.props.Document[Id]} ref={this.createBeforeDropTarget}>
                    <ContentFittingDocumentView {...this.props}
                        Document={this.props.Document.afterDoc} />
                </div> */}
            </div>);
    }
}